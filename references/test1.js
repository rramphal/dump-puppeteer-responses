const chromeLauncher = require('chrome-launcher');
const CDP            = require('chrome-remote-interface');

const CHROMIUM_PATH = '/usr/local/bin/chromium';
const URL = 'https://github.com';

function launchChrome (headless = false) {
  return chromeLauncher.launch({
    chromePath: CHROMIUM_PATH,
    chromeFlags: [
      ...chromeLauncher.Launcher.defaultFlags(),
      // '--window-size=412,732',
      // '--user-data-dir=/tmp/foobar',
      '--enable-logging',
      '--auto-open-devtools-for-tabs',
      headless ? '--headless' : ''
    ]
  });
}

async function main () {
  let chrome;
  let protocol;

  try {
    chrome = await launchChrome();
    protocol = await CDP({ port: chrome.port });

    const { Network, Page, Runtime } = protocol;
    await Promise.all([
      Page.enable(),
      Runtime.enable(),
      Network.enable(),
    ]);

    Runtime.consoleAPICalled(({ args, type }) => {
      console[type].apply(console, args.map(a => a.value))
    });

    Network.requestWillBeSent(({ requestId, request}) => {
      console.log('REQUEST', requestId, request.url);
    });

    console.log(Network.getResponseBody);

    Network.getResponseBody((params) => {

    });

    // await Network.setRequestInterception({
    //   patterns: [
    //     {
    //       urlPattern: '*.js*',
    //       resourceType: 'Script',
    //       interceptionStage: 'HeadersReceived',
    //     }
    //   ],
    // });

    // await Page.navigate({ url: URL });

    await Page.loadEventFired();
  } catch (error) {
    console.error(error);
  } finally {
    if (protocol && chrome) {
      // commenting the following line keeps the browser open
      // protocol.close();
      // chrome.kill();
    }
  }
}

main();
