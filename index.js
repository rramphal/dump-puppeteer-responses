// Copyright: (c) 2022, Ravi S. Rāmphal <rramphal@gmail.com>
// GNU General Public License v3.0 (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)

const randomUUID = require('crypto').randomUUID;
const fs         = require('fs');
const URL        = require('url').URL;

const sqlite3 = require('better-sqlite3')
const dayjs   = require('dayjs');
const mimeDb  = require('mime-db');
const fetch   = require('cross-fetch');

const puppeteer       = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');

// =============================================================================

const INCLUDE_PATTERNS = {
  EVERYTHING : /.*/,
  PNG        : /\.png/,
  XHTML      : /\.xhtml/,
  IMAGE      : /\.(jpg|jpeg|gif|png|svg|bmp|tif|tiff|webp)/,
}
const INCLUDE_PATTERN = INCLUDE_PATTERNS.EVERYTHING;

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

function getExtensionFromContentType (contentType) {
  const mimeData = mimeDb[contentType];

  if (mimeData) {
    const extensions = mimeData.extensions;

    if (extensions && extensions.length) {
      return extensions[0];
    }
  }
}

function getDataFromResponse (response) {
  let extension;

  const rawUrl      = response.url();
  const rawHeaders  = response.headers();
  const contentType = rawHeaders['content-type'];

  const sanitizedUrl = rawUrl.replace(/\/+$/, ''); // remove trailing slashes
  const urlTokens    = new URL(sanitizedUrl);
  const { pathname } = urlTokens;
  const segments     = pathname.split('/');
  const lastSegment  = segments[segments.length - 1];

  // if last segment did not include a dot (lazy test
  // for an extension) or if the extracted extension is
  // too long then pull it from `content-type`
  if (lastSegment.includes('.')) {
    const filenameTokens = lastSegment.split('.');

    extension = filenameTokens[filenameTokens.length - 1];

    if (extension.length > 10) {
      extension = getExtensionFromContentType(contentType);
    }
  } else {
    extension = getExtensionFromContentType(contentType);
  }

  const headers = JSON.stringify(rawHeaders, null, 2);

  return {
    extension: extension ? extension : 'txt', // default to plain text
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
        .replace(/,$/, '')  // remove trailing comma
        .replace(/'$/, '')  // remove trailing single quote
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
      '--incognito',
    ],
  });

  const page = (await browser.pages())[0];

  // navigate directly to URL if a valid one is provided
  if (process.argv.length === 3) {
    const url = process.argv[2];

    try {
      new URL(url); // throws if URL is invalid
      page.goto(url);
    } catch (error) {
      console.error('Ignoring invalid URL passed in:', url);
    }
  }

  page.on('response', async (response) => {
    try {
      const status = response.status();

      // if not a redirect or error
      if (status < 300) {
        const url = response.url();

        if (!INCLUDE_PATTERN.test(url)) return;

        console.log('[URL]', url);

        const buffer = await response.buffer();
        const id     = `${dayjs().format('YYYYMMDD_HH.ss.SSS')}_${randomUUID()}`;

        const { extension, headers } = getDataFromResponse(response);

        const filename = `${id}.${extension}`;
        writeFile(filename, buffer);

        insertStatement.run(id, extension, url, headers);
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
      id           STRING   PRIMARY KEY
                            NOT NULL
                            UNIQUE,
      extension    STRING   NOT NULL,
      url          STRING   NOT NULL,
      headers      STRING,
      created_at   DATETIME NOT NULL
                            DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') )
    );
  `);

  createStatement.run();

  const insertStatement = db.prepare(`
    INSERT
    INTO
      files (id, extension, url, headers)
    VALUES
      (?, ?, ?, ?);
  `);

  return { db, insertStatement };
}

async function main () {
  mkdirp(OUTPUT_DIRECTORY);

  const { db, insertStatement } = setupDatabase();

  runBrowser(insertStatement);
}

main();
