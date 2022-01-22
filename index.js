const randomUUID = require('crypto').randomUUID;
const fs         = require('fs');

const mimeDb = require('mime-db');

const puppeteer       = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');

// =============================================================================

puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(StealthPlugin());

// =============================================================================

const OUTPUT_DIRECTORY = './responses';

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

    const filename = getFilenameFromResponse(response);

    // if not a redirect or error
    if (status < 300) {
      writeFile(filename, buffer);
      console.log(response);
    }
  });
}

main();
