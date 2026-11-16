// Browser verification against a running local backend; all storage stays in disposable browser contexts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { modules } = require('../miniprogram/utils/integrations');
const playwright = require(process.env.PLAYWRIGHT_PATH || path.resolve(process.execPath, '../../node_modules/playwright'));
const origin = process.env.MODULE_TEST_ORIGIN || 'http://127.0.0.1:3002';
const out = path.join(__dirname, '../artifacts/ui/modules');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = { origin, viewport: { width: 390, height: 844 }, modules: [], status: 'running' };
  try {
    for (const item of modules) {
      const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage(), result = { slug: item.slug, title: item.title, errors: [], failedResources: [], externalLinks: [] };
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
      page.on('requestfailed', request => result.failedResources.push({ url: request.url(), error: request.failure()?.errorText }));
      page.on('response', response => { if (response.status() >= 400) result.failedResources.push({ url: response.url(), status: response.status() }); });
      try {
        const token = process.env.MODULE_TEST_TOKEN;
        if (!token) throw new Error('Set MODULE_TEST_TOKEN to an entitled local test user token');
        const launch = await context.request.post(origin + '/api/boards/module-' + item.slug + '/open', { headers: { Authorization: 'Bearer ' + token } });
        assert.equal(launch.status(), 200, 'entitled launch');
        const { launchPath } = await launch.json();
        const response = await page.goto(origin + launchPath, { waitUntil: 'networkidle', timeout: 20000 });
        assert.equal(response.status(), 200);
        await page.waitForURL(url => url.origin === origin && url.pathname === '/modules/' + item.slug + '/', { waitUntil: 'networkidle', timeout: 20000 });
        result.documentTitle = await page.title();
        assert.equal(result.documentTitle, item.title, 'exact document title');
        result.visibleText = (await page.locator('body').innerText()).slice(0, 1400);
        assert(result.visibleText.length > 80, 'learning content rendered');
        result.layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, background: getComputedStyle(document.documentElement).backgroundColor }));
        assert(result.layout.scrollWidth <= result.layout.width + 2, 'mobile page has no horizontal overflow');
        result.externalLinks = await page.locator('a:visible').evaluateAll(nodes => nodes.filter(node => /github\.com/i.test(node.href) || /^(关于|About|GitHub)$/i.test(node.textContent.trim())).map(node => ({ text: node.textContent.trim(), href: node.href })));
        assert.equal(result.externalLinks.length, 0, 'no GitHub or About navigation');
        await page.screenshot({ path: path.join(out, item.slug + '.png') });
        assert.deepEqual(result.errors, [], 'no browser runtime or policy errors');
        assert.deepEqual(result.failedResources, [], 'all initial resources load');
        result.status = 'passed';
      } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
      report.modules.push(result); console.log(result.status.toUpperCase(), item.slug, result.error || '');
      await context.close();
    }
    report.status = report.modules.every(item => item.status === 'passed') ? 'passed' : 'failed';
  } finally {
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
