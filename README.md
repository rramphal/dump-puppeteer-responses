# Dump Puppeteer Responses

This script spins up Puppeteer and allows the user to
navigate the Internet while saving a copy of all
response bodies to disk.

These files are saved with a UUID and a relevant
extension to a single output directory while the
original URL and headers are written to a SQLite3
database.

## Features

* uses [`puppeteer-extra` & plugins](https://github.com/berstend/puppeteer-extra) to try to avoid detection
* replicates flags used by [`chrome-launcher`](https://github.com/GoogleChrome/chrome-launcher/blob/master/src/flags.ts) to disable ["many Chrome services that add noise to automated scenarios"](https://github.com/GoogleChrome/chrome-launcher)

## Running

<!-- Please remember to update `.cdmessage` if this gets updated -->
```shell
npm install

node index.js
```
