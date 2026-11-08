/* Isolated component/mock HTTP regression. No accounts, providers or fixture workspace are contacted. */
const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const puppeteer = require('puppeteer-core');
(async () => {
  const { createServer } = await import('vite'); const { default: vue } = await import('@vitejs/plugin-vue');
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'sequo-enrollment-browser-'));
  const at = '2026-11-08T10:00:00.123456Z'; let writes = 0, lost = true, expired = false, accountStatus = 'ACTIVE', accountRoles = ['MERCHANT_OWNER', 'COURIER']; const rows = { merchants: [], courier: null, history: [] };
  const snapshot = () => ({ user: { id: 'owner-fixture', email: 'owner@fixture.invalid', displayName: 'Mock approved account', active: true, status: accountStatus, roles: accountRoles, updatedAt: at }, ...rows });
  const server = await createServer({ configFile: false, envDir: false, root: process.cwd(), cacheDir: cache, server: { host: '127.0.0.1', port: 0, strictPort: true }, plugins: [vue(), {
    name: 'isolated-enrollment-harness',
    transformIndexHtml() { return '<html><body><div id="app"></div><script type="module" src="/enrollment-harness.js"></script></body></html>' },
    resolveId(id) { return id === '/enrollment-harness.js' ? id : null },
    load(id) { if (id !== '/enrollment-harness.js') return null; return `import {createApp,h} from 'vue';import Panel from '/src/AdminEnrollmentPanel.vue';import '/src/assets/main.css';const kind=new URLSearchParams(location.search).get('kind')||'merchant';const request=async(path,_retry,method='GET',body)=>{const result=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await result.json();if(!result.ok)throw Error(value.message);return value};createApp({render:()=>h('main',{style:'padding:24px'},[h(Panel,{kind,request,actorId:'admin-fixture',initialUserId:'owner-fixture'})])}).mount('#app');` },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (expired) { res.statusCode = 401; return res.end(JSON.stringify({ message: 'Mock staff session expired; sign in again.' })) }
      if (req.method === 'GET' && req.url.startsWith('/api/admin/web/enrollment/users/')) return res.end(JSON.stringify(snapshot()));
      if (req.method === 'GET' && req.url.startsWith('/api/admin/web/users')) return res.end(JSON.stringify([snapshot().user]));
      if (req.method !== 'POST' || !['/api/admin/web/enrollment/merchants', '/api/admin/web/enrollment/couriers'].includes(req.url)) { res.statusCode = 404; return res.end('{}') }
      let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); writes++;
      assert.equal(body.userId, 'owner-fixture'); assert.equal(body.expectedUserUpdatedAt, at); assert.ok(body.reason); assert.ok(body.idempotencyKey);
      const merchant = req.url.endsWith('merchants'), entityId = merchant ? 'new-merchant' : 'new-courier';
      const operation = { id: `operation-${entityId}`, kind: merchant ? 'MERCHANT' : 'COURIER', userId: body.userId, entityId, actorUserId: 'admin-fixture', reason: body.reason, idempotencyKey: body.idempotencyKey, createdAt: at, recordedName: merchant ? body.name : null, workforceType: merchant ? null : body.workforceType, vehicleType: merchant ? null : body.vehicleType };
      rows.history.push(operation);
      if (merchant) rows.merchants.push({ id: entityId, name: body.name, status: 'ACTIVE', createdAt: at, updatedAt: at });
      else rows.courier = { id: entityId, status: 'ACTIVE', workforceType: 'FREELANCER', vehicleType: body.vehicleType, createdAt: at, updatedAt: at };
      if (merchant && lost) { lost = false; res.statusCode = 503; return res.end(JSON.stringify({ message: 'Mock interrupted acknowledgement' })) }
      res.end(JSON.stringify({ record: snapshot(), operation }));
    }) },
  }] });
  let browser;
  try {
    await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true); page.on('request', req => req.url().startsWith(origin) ? req.continue() : req.abort());
    const click = async text => page.evaluate(text => { const element = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text); if (!element) throw Error(`Missing control ${text}`); element.click() }, text);
    const fill = async (label, value) => page.evaluate((label, value) => { const element = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(label))?.querySelector('input,textarea,select'); if (!element) throw Error(`Missing field ${label}`); element.value = value; element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }, label, value);
    await page.goto(origin); await click('Refresh account and history'); await page.waitForSelector('.enrollment-account');
    await fill('Merchant name', 'Mock merchant'); await fill('Enrollment reason', 'Reviewed local-only enrollment'); await click('Review enrollment'); await page.waitForSelector('.enrollment-review');
    await click('Cancel'); assert.equal(writes, 0); assert.equal(await page.$('.enrollment-review'), null);
    await click('Review enrollment'); await click('Confirm enrollment'); await page.waitForFunction(() => document.body.innerText.includes('Mock interrupted acknowledgement')); assert.equal(writes, 1);
    await page.reload(); await page.waitForSelector('.pending-action-tools'); assert.equal(writes, 1, 'Reload does not replay enrollment');
    assert.equal(await page.$eval('fieldset', f => f.disabled), true);
    await click('Refresh account and history'); await page.waitForSelector('.enrollment-account'); await click('Review exact saved enrollment'); await click('Confirm enrollment');
    await page.waitForFunction(() => document.body.innerText.includes('Enrollment confirmed by server history: new-merchant'));
    assert.equal(writes, 1, 'Canonical lost acknowledgement readback sends no duplicate POST'); assert.equal(await page.$('.pending-action-tools'), null);
    await page.goto(`${origin}/?kind=courier`); await click('Refresh account and history'); await page.waitForSelector('.enrollment-account');
    assert.deepEqual(await page.$$eval('select option', options => options.filter(o => o.value).map(o => o.value)), ['SequoSalaried', 'Freelancer', 'Moto', 'Bicycle', 'Car', 'Van']);
    await fill('Recorded workforce', 'Freelancer'); await fill('Vehicle', 'Van'); await fill('Enrollment reason', 'Reviewed independent rider profile'); await click('Review enrollment'); await page.waitForSelector('.enrollment-review'); await click('Confirm enrollment');
    await page.waitForFunction(() => document.body.innerText.includes('Enrollment confirmed by server history: new-courier')); assert.equal(writes, 2);
    accountRoles = ['CUSTOMER'];
    await page.goto(origin); await click('Refresh account and history'); await page.waitForSelector('.enrollment-account');
    await fill('Merchant name', 'Another mock shop'); await fill('Enrollment reason', 'Must not grant account roles'); await click('Review enrollment');
    await page.waitForFunction(() => document.querySelector('.error-text')?.textContent.includes('MERCHANT_OWNER'));
    assert.equal(await page.$('.enrollment-review'), null); assert.equal(writes, 2);
    accountRoles = ['MERCHANT_OWNER', 'COURIER']; accountStatus = 'SUSPENDED';
    await click('Refresh account and history'); await page.waitForFunction(() => document.querySelector('.enrollment-account')?.textContent.includes('SUSPENDED'));
    await click('Review enrollment'); await page.waitForFunction(() => document.querySelector('.error-text')?.textContent.includes('active account'));
    assert.equal(writes, 2);
    accountStatus = 'ACTIVE'; await click('Refresh account and history'); await page.waitForFunction(() => document.querySelector('.enrollment-account')?.textContent.includes('ACTIVE'));
    await click('Review enrollment'); await page.waitForSelector('.enrollment-review'); expired = true; await click('Confirm enrollment');
    await page.waitForFunction(() => document.querySelector('.error-text')?.textContent.includes('session expired'));
    assert.equal(writes, 2, 'Expired preflight never submits enrollment'); assert.ok(await page.$('.pending-action-tools'));
    assert.equal(await page.$eval('fieldset', field => field.disabled), true);
    assert.deepEqual(errors, []); await page.screenshot({ path: '/tmp/sequo-admin-enrollment-mock.png', fullPage: true });
    console.log('PASS: mock enrollment account read, review/cancel, lost acknowledgement, reload frozen intent, canonical history without duplicate POST, supported rider choices, distinct rider profile confirmation, missing-role/suspended denial before write, expired preflight with frozen intent, zero page errors. LOCAL MOCK HTTP ONLY.');
  } finally { if (browser) await browser.close(); await server.close(); fs.rmSync(cache, { recursive: true, force: true }) }
})().catch(error => { console.error(error); process.exitCode = 1 });
