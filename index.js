const randomUUID = require('crypto').randomUUID;
const fs         = require('fs');

var mimeDb = require('mime-db');

const puppeteer       = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');

// =============================================================================

puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(StealthPlugin());

// =============================================================================

const OUTPUT_DIRECTORY = './responses';

const URL_PATTERNS = [
  {
    urlPattern: '*',
    requestStage: 'Response',
  },
];

// =============================================================================

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

function getExtensionFromResponse (response, shouldPrefixDot = true) {
  const headers = response._headers;

  if (headers) {
    const contentType = headers['content-type'];
    const mimeData    = mimeDb[contentType];

    if (mimeData) {
      const extensions = mimeData.extensions;

      if (extensions && extensions.length) {
        return `${shouldPrefixDot ? '.' : ''}${extensions[0]}`;
      }
    }
  }

  return '';
}

async function main () {
  mkdirp(OUTPUT_DIRECTORY);

  const browser = await puppeteer.launch({
    headless        : false,
    defaultViewport : null,
    devtools        : true,
    args            : [
      '--window-size=1920,1170',
      '--window-position=0,0',
      '--enable-logging',
      '--auto-open-devtools-for-tabs',
    ],
  });

  const page = (await browser.pages())[0];

  page.on('response', async (response) => {
    const status   = response.status();
    const buffer   = await response.buffer();

    const filenameBase      = randomUUID();
    const filenameExtension = getExtensionFromResponse(response, true);
    const filename          = `${filenameBase}${filenameExtension}`;

    // if not a redirect or error
    if (status < 300) {
      writeFile(filename, buffer);
      console.log(response);
    }
  });
}

main();
