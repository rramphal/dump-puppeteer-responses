const randomUUID = require('crypto').randomUUID;
const fs         = require('fs');

const mimeDb = require('mime-db');
const fetch  = require('cross-fetch');

const puppeteer       = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');

// =============================================================================

puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(StealthPlugin());

// =============================================================================

const OUTPUT_DIRECTORY = './responses';
const CHROME_LAUNCHER_FLAGS_URL = 'https://raw.githubusercontent.com/GoogleChrome/chrome-launcher/master/src/flags.ts';

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
  // make sure path exists
  fs.mkdirSync(directoryPath, { recursive: true });
}

function getFilenameFromResponse (response) {
  let filename = randomUUID(); // default to a random name

  const url     = response.url();
  const headers = response._headers;

  if (url) {
    const sanitizedUrl = url.replace(/\/+$/, '') // remove trailing slashes
    const urlTokens = new URL(sanitizedUrl);
    const { pathname } = urlTokens;
    const segments = pathname.split('/');
    filename = segments[segments.length - 1]; // use last segment if we can
  }

  // if last segment did not include a dot (lazy test for an extension)
  // then pull it from `content-type`
  if (!filename.includes('.')) {
    if (headers) {
      const contentType = headers['content-type'];
      const mimeData    = mimeDb[contentType];

      if (mimeData) {
        const extensions = mimeData.extensions;

        if (extensions && extensions.length) {
          filename += extensions[0];
        }
      }
    }
  }

  return filename;
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

  return flags;
}

async function main () {
  mkdirp(OUTPUT_DIRECTORY);

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
    const status = response.status();

    // if not a redirect or error
    if (status < 300) {
      const url      = response.url();
      const buffer   = await response.buffer();
      const filename = getFilenameFromResponse(response);

      console.log('DUMPING', url);
      writeFile(filename, buffer);
    }
  });
}

main();
