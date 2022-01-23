const randomUUID = require('crypto').randomUUID;
const fs         = require('fs');

const sqlite3 = require('better-sqlite3')
const mimeDb  = require('mime-db');
const fetch   = require('cross-fetch');

const puppeteer       = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');

// =============================================================================

const OUTPUT_DIRECTORY = './output/responses';

const DATABASE_PATH = './output/responses.sqlite3';

const CHROME_LAUNCHER_FLAGS_URL = 'https://raw.githubusercontent.com/GoogleChrome/chrome-launcher/master/src/flags.ts';

// =============================================================================

puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(StealthPlugin());

// =============================================================================

// this is naïve - assumes no duplicate names
// and dumps everything into one folder
function writeFile (filename, buffer) {
  fs.writeFile(`${OUTPUT_DIRECTORY}/${filename}`, buffer, 'binary', (error) => {
    if (error) {
      console.error(error);
    }
  });
}

function mkdirp (directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function getDataFromResponse (response) {
  let extension = 'txt'; // default to plain text

  const rawUrl      = response.url();
  const rawHeaders  = response._headers;
  const contentType = rawHeaders['content-type'];

  const sanitizedUrl = rawUrl.replace(/\/+$/, ''); // remove trailing slashes
  const urlTokens    = new URL(sanitizedUrl);
  const { pathname } = urlTokens;
  const segments     = pathname.split('/');
  const lastSegment  = segments[segments.length - 1];

  // if last segment did not include a dot (lazy test for an extension)
  // then pull it from `content-type`
  if (lastSegment.includes('.')) {
    const filenameTokens = lastSegment.split('.');

    extension = filenameTokens[filenameTokens.length - 1];
  } else {
    const mimeData = mimeDb[contentType];

    if (mimeData) {
      const extensions = mimeData.extensions;

      if (extensions && extensions.length) {
        extension = extensions[0];
      }
    }
  }

  const headers = JSON.stringify(rawHeaders);

  return {
    contentType,
    extension,
    headers,
  };
}

async function getChromeLauncherDefaultFlags () {
  const response = await fetch(CHROME_LAUNCHER_FLAGS_URL);
  const body = await response.text();
  const flags = body
    .split('\n')
    .filter((line) => line.startsWith(`  '--`)) // filter for flags
    .map((line) => {
      return line
        .replace(/,$/, '') // remove trailing comma
        .replace(/'$/, '') // remove trailing single quote
        .replace(`  '`, '') // remove leading whitespace and leading single quote
      ;
    })
  ;

  console.log('ADDING FLAGS:', flags);

  return flags;
}

async function runBrowser (insertStatement) {
  const browser = await puppeteer.launch({
    headless        : false,
    defaultViewport : null,
    devtools        : true,
    args            : [
      ...(await getChromeLauncherDefaultFlags()),
      '--window-size=1920,1080',
      '--window-position=0,0',
      '--enable-logging',
      '--auto-open-devtools-for-tabs',
    ],
  });

  const page = (await browser.pages())[0];

  page.on('response', async (response) => {
    try {
      const status = response.status();

      // if not a redirect or error
      if (status < 300) {
        const url = response.url();
        console.log('[URL]', url);

        const buffer = await response.buffer();
        const uuid   = randomUUID();

        const { contentType, extension, headers } = getDataFromResponse(response);

        const filename = `${uuid}.${extension}`;
        writeFile(filename, buffer);

        insertStatement.run(uuid, url, extension, contentType, headers);
      }
    } catch (error) {
      console.error('\n============================\n');
      console.error(error);
      console.error('\n============================\n');
    }
  });
}

function setupDatabase () {
  const db = sqlite3(DATABASE_PATH);

  const createStatement = db.prepare(`
    CREATE TABLE IF NOT EXISTS files (
      uuid         STRING   PRIMARY KEY
                            NOT NULL
                            UNIQUE,
      url          STRING   NOT NULL,
      extension    STRING   NOT NULL,
      content_type STRING,
      headers      STRING,
      created_at   DATETIME NOT NULL
                            DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') )
    );
  `);

  createStatement.run();

  const insertStatement = db.prepare(`
    INSERT
    INTO
      files (uuid, url, extension, content_type, headers)
    VALUES
      (?, ?, ?, ?, ?);
  `);

  return { db, insertStatement };
}

async function main () {
  mkdirp(OUTPUT_DIRECTORY);

  const { db, insertStatement } = setupDatabase();

  runBrowser(insertStatement);
}

main();
