const puppeteer = require('puppeteer');
const prettier  = require('prettier');
const atob      = require('atob');
const btoa      = require('btoa');

const requestCache = new Map();

const urlPatterns = [
  '*'
]

function transform (source) {
  return prettier.format(source, { parser: 'babel'});
}

async function intercept (page, patterns, transform) {
  const client = await page.target().createCDPSession();

  await client.send('Network.enable');

  await client.send('Network.setRequestInterception', {
    patterns: patterns.map(pattern => ({
      urlPattern: pattern,
      resourceType: 'Script',
      interceptionStage: 'HeadersReceived',
    }))
  });

  client.on('Network.requestIntercepted', async ({ interceptionId, request, responseHeaders, resourceType }) => {
    console.log(`Intercepted ${request.url} {interception id: ${interceptionId}}`);

    const response = await client.send('Network.getResponseBodyForInterception',{ interceptionId });

    const contentTypeHeader = Object.keys(responseHeaders).find(k => k.toLowerCase() === 'content-type');
    let newBody, contentType = responseHeaders[contentTypeHeader];

    if (requestCache.has(response.body)) {
      newBody = requestCache.get(response.body);
    } else {
      const bodyData = response.base64Encoded ? atob(response.body) : response.body;
      try {
        if (resourceType === 'Script') newBody = transform(bodyData, { parser: 'babel' });
        else newBody === bodyData
      } catch(e) {
        console.log(`Failed to process ${request.url} {interception id: ${interceptionId}}: ${e}`);
        newBody = bodyData
      }

      requestCache.set(response.body, newBody);
    }

    const newHeaders = [
      'Date: ' + (new Date()).toUTCString(),
      'Connection: closed',
      'Content-Length: ' + newBody.length,
      'Content-Type: ' + contentType
    ];

    console.log(`Continuing interception ${interceptionId}`)
    client.send('Network.continueInterceptedRequest', {
      interceptionId,
      rawResponse: btoa('HTTP/1.1 200 OK' + '\r\n' + newHeaders.join('\r\n') + '\r\n\r\n' + newBody)
    });
  });
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    devtools: true,
    args: [
      '--window-size=1920,1170',
      '--window-position=0,0',
    ],
  });

  const page = (await browser.pages())[0];

  intercept(page, urlPatterns, transform);

  browser.on('targetcreated', async (target) => {
    const page = await target.page();
    intercept(page, urlPatterns, transform);
  });
}

main();
