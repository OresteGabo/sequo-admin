/* LOCAL MOCK HTTP ONLY. Serves an existing same-origin fixture build; no live store/accounts/providers. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const revision = '2026-11-08T08:00:00.123456Z';
const merchantId = 'store-merchant';
const actorId = 'store-admin-fixture';
const copy = value => JSON.parse(JSON.stringify(value));
let state = { merchantId, configured: false, open: false, acceptingOrders: false, timezone: null, openingHours: [], temporaryExceptions: [], temporaryClosure: null, closureReason: null, openStatus: 'LEGACY_UNCONFIGURED', updatedAt: revision, canAcceptOrders: true, history: [] };
let readMode = 'valid';
let loseAcknowledgement = false;
let writes = 0;
let applied = 0;
const canonical = new Map();
const requests = [];
const errors = [];
const staticRoot = path.resolve(process.cwd(), 'dist');
assert.ok(fs.existsSync(path.join(staticRoot, 'index.html')), 'Build the same-origin fixture first.');
const body = async req => { let text = ''; for await (const chunk of req) text += chunk; return JSON.parse(text); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    if (!url.pathname.startsWith('/api/')) {
      const relative = /^\/(assets|brand)\//.test(url.pathname) ? url.pathname.slice(1) : 'index.html';
      const file = path.resolve(staticRoot, relative);
      if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
      res.end(fs.readFileSync(file)); return;
    }
    requests.push({ method: req.method, path: url.pathname });
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    let result;
    if (url.pathname === '/api/auth/me') result = { id: actorId, displayName: 'LOCAL MOCK HTTP STORE ADMIN', email: 'store-admin@fixture.invalid', provider: 'EMAIL', status: 'ACTIVE', active: true, roles: ['ADMIN'] };
    else if (url.pathname === '/api/admin-auth/development-access') result = { enabled: false, mode: 'DISABLED' };
    else if (url.pathname === '/api/admin/web/overview') result = { totals: { orders: 0, merchants: 1, users: 1, activeDeliveries: 0 } };
    else if (url.pathname === '/api/admin/monitoring/operations') result = { generatedAt: revision, merchantFulfillment: { sellerBacklog: 0, readyForPickup: 0 }, deliveryCapacity: { activeMissions: 0, pausedCouriers: 0, problemMissions: [] }, relayOperations: { delayedParcels: 0, problemParcels: 0 }, returnBottlenecks: { returnsWaitingRelayAction: 0, returnsWaitingSequoCollection: 0, returnsInProblem: 0 }, payoutQueue: { merchantPayoutCandidates: 0 } };
    else if (url.pathname === '/api/admin/web/orders' || url.pathname === '/api/admin/web/users') result = [];
    else if (url.pathname === '/api/admin/web/merchants') result = [{ id: merchantId, name: 'LOCAL MOCK HTTP merchant', status: 'ACTIVE', commissionRateBps: 1500, createdAt: revision, updatedAt: revision }];
    else if (url.pathname === `/api/admin/web/merchants/${merchantId}/store` && req.method === 'GET') {
      assert.equal(req.headers.authorization, 'Bearer fixture-store-admin');
      result = copy(state);
      if (readMode === 'malformed') delete result.acceptingOrders;
      if (readMode === 'incomplete-week') result.openingHours = [{ dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00', closed: false }];
    } else if (url.pathname === `/api/admin/web/merchants/${merchantId}/store` && req.method === 'PUT') {
      assert.equal(req.headers.authorization, 'Bearer fixture-store-admin');
      const input = await body(req); writes++;
      assert.deepEqual(Object.keys(input).sort(), ['open','acceptingOrders','timezone','openingHours','temporaryExceptions','temporaryClosure','closureReason','reason','expectedUpdatedAt','idempotencyKey'].sort());
      assert.equal(input.timezone, 'UTC'); assert.deepEqual(input.openingHours, []);
      assert.deepEqual(input.temporaryExceptions, []); assert.equal(input.temporaryClosure, null);
      assert.equal(input.acceptingOrders, true);
      assert.match(input.idempotencyKey, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
      assert.ok(input.reason.startsWith('LOCAL MOCK HTTP'));
      let operation;
      if (canonical.has(input.idempotencyKey)) { const prior = canonical.get(input.idempotencyKey); assert.deepEqual(input, prior.input); operation = prior.operation; }
      else {
        assert.equal(input.expectedUpdatedAt, state.updatedAt, 'The exact nested store revision is retained');
        applied++;
        const at = applied === 1 ? '2026-11-08T08:01:00.123456Z' : '2026-11-08T08:02:00.123456Z';
        operation = { id: `store-change-${applied}`, action: 'SET_STORE_SETTINGS', actorUserId: actorId, reason: input.reason, idempotencyKey: input.idempotencyKey, createdAt: at };
        state = { merchantId, configured: true, open: input.open, acceptingOrders: input.acceptingOrders, timezone: input.timezone, openingHours: copy(input.openingHours), temporaryExceptions: copy(input.temporaryExceptions), temporaryClosure: copy(input.temporaryClosure), closureReason: input.closureReason, openStatus: input.open ? 'OPEN' : 'MANUALLY_PAUSED', updatedAt: at, canAcceptOrders: input.open && input.acceptingOrders, history: [operation, ...state.history] };
        canonical.set(input.idempotencyKey, { input: copy(input), operation });
      }
      if (loseAcknowledgement) { loseAcknowledgement = false; res.writeHead(503).end(JSON.stringify({ message: 'LOCAL MOCK HTTP interrupted store acknowledgement' })); return; }
      result = { record: copy(state), operation };
    } else { res.statusCode = 404; result = { message: 'LOCAL MOCK HTTP route not configured' }; }
    res.end(JSON.stringify(result));
  } catch (error) { errors.push(`Fixture contract: ${error.message}`); res.writeHead(500).end(JSON.stringify({ message: 'LOCAL MOCK HTTP contract assertion failed' })); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.createBrowserContext(); const page = await context.newPage();
  page.setDefaultTimeout(12000); await page.setViewport({ width: 1440, height: 1080 });
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true); page.on('request', request => request.url().startsWith(origin) ? request.continue() : request.abort());
  await page.evaluateOnNewDocument(() => { sessionStorage.setItem('sequo_admin_access_token', 'fixture-store-admin'); sessionStorage.setItem('sequo_admin_refresh_token', 'LOCAL_MOCK_HTTP_REFRESH'); });
  async function click(selector, label) {
    await page.evaluate((selector, label) => { const node = [...document.querySelectorAll(selector)].find(item => item.textContent.trim().includes(label)); if (!node) throw new Error(`Missing control ${label}`); node.click(); }, selector, label);
  }
  async function field(label, value, root = '.merchant-store-editor') {
    await page.evaluate((label, value, root) => { const container = [...document.querySelectorAll(`${root} label`)].find(item => item.textContent.trim().startsWith(label)); if (!container) throw new Error(`Missing field ${label}`); const input = container.querySelector('input,textarea,select'); if (!input) throw new Error(`Missing input ${label}`); if (input.type === 'checkbox') input.checked = value; else input.value = value; input.dispatchEvent(new Event(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, label, value, root);
  }
  async function openStore() {
    await click('.nav-button', 'Merchants'); await page.waitForSelector('button.merchant-row.selectable-row'); await click('button.merchant-row.selectable-row', 'LOCAL MOCK HTTP merchant'); await page.waitForSelector('.detail-card button'); await click('.detail-card button', 'Manage store'); await page.waitForSelector('.merchant-store-editor form');
  }
  async function confirm() {
    await field('I reviewed these changes', true, '.merchant-store-editor .change-preview'); await click('.merchant-store-editor .change-preview button', 'Confirm store change');
  }
  try {
    await page.goto(origin); await page.waitForSelector('.sidebar'); await openStore();
    assert.ok(await page.$eval('.store-readback', node => node.textContent.includes('No store policy is configured') && node.textContent.includes('no hours are assumed')));
    assert.equal(await page.$eval('.merchant-store-editor select', select => select.value), '');
    assert.equal(await page.$('.weekly-hours'), null, 'Unconfigured state must not invent weekly hours');
    await field('Reason for this change', 'LOCAL MOCK HTTP manual closure');
    assert.equal(await page.$eval('.merchant-store-editor select', select => select.checkValidity()), false, 'Timezone is a deliberate choice');
    await field('Store timezone', 'UTC'); await field('Use weekly hours', true);
    assert.equal(await page.$$eval('.weekly-hours > div', rows => rows.length), 7);
    await click('.merchant-store-editor form button', 'Review store change');
    assert.equal(await page.$eval('.merchant-store-editor form', form => form.checkValidity()), false);
    assert.equal(writes, 0, 'Incomplete weekly hours never write');
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.weekly-hours > div')];
      rows.forEach((row, index) => {
        if (index > 0) { const checkbox = row.querySelector('input[type=checkbox]'); checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); }
        else { const times = row.querySelectorAll('input[type=time]'); times[0].value = '22:00'; times[1].value = '06:00'; times.forEach(input => input.dispatchEvent(new Event('input', { bubbles: true }))); }
      });
    });
    await click('.merchant-store-editor form button', 'Review store change');
    await page.waitForFunction(() => document.querySelector('.merchant-store-editor .error-text')?.textContent.includes('Overnight hours are unsupported'));
    assert.equal(writes, 0);
    await field('Use weekly hours', false); await field('Manually open', false);
    await field('Closure note', 'LOCAL MOCK HTTP maintenance');
    await click('.merchant-store-editor form button', 'Review store change');
    await page.waitForSelector('.merchant-store-editor .change-preview h4');
    assert.equal(await page.$$eval('.merchant-store-editor .change-preview button', buttons => buttons.find(button => button.textContent.includes('Confirm store change')).disabled), true);
    await click('.merchant-store-editor .change-preview button', 'Continue editing');
    assert.equal(writes, 0, 'Cancelling a review cannot change the server');
    await click('.merchant-store-editor form button', 'Review store change'); await confirm();
    await page.waitForFunction(() => document.querySelector('.merchant-store-editor')?.textContent.includes('Store change confirmed in server history'));
    assert.equal(writes, 1); assert.equal(applied, 1); assert.equal(state.open, false); assert.equal(state.canAcceptOrders, false);
    assert.ok(await page.$eval('.store-readback', node => node.textContent.includes('Accepts new orders now: No')));
    assert.ok(await page.$eval('.merchant-store-editor', node => node.textContent.includes('store-admin-fixture') && node.textContent.includes('LOCAL MOCK HTTP manual closure')));

    await field('Manually open', true); await field('Reason for this change', 'LOCAL MOCK HTTP reopening');
    await click('.merchant-store-editor form button', 'Review store change'); loseAcknowledgement = true; await confirm();
    await page.waitForFunction(() => document.querySelector('.merchant-store-editor')?.textContent.includes('A reviewed save is not yet confirmed'));
    assert.equal(writes, 2); assert.equal(applied, 2);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('sequo_store_pending:store-admin-fixture:')).length), 1);
    await page.reload(); await page.waitForSelector('.sidebar');
    assert.equal(writes, 2, 'Reload cannot submit a saved store change');
    await openStore();
    await page.waitForFunction(() => document.querySelector('.merchant-store-editor')?.textContent.includes('Your reviewed change is recorded'));
    assert.equal(writes, 2); assert.equal(applied, 2); assert.equal(state.history.length, 2);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('sequo_store_pending:store-admin-fixture:')).length), 0);
    await page.screenshot({ path: '/tmp/sequo-admin-store-editor-mock-http.png', fullPage: true });

    for (const mode of ['malformed', 'incomplete-week']) {
      readMode = mode; await click('.merchant-store-editor header button', 'Refresh store');
      await page.waitForFunction(() => document.querySelector('.merchant-store-editor .error-text')?.textContent.includes('unavailable') && !document.querySelector('.merchant-store-editor header button').disabled);
      assert.equal(await page.$('.merchant-store-editor form'), null, `${mode}: invalid records are not editable`);
      assert.equal(await page.$('.merchant-store-editor .store-readback'), null, `${mode}: no fabricated open/closed state`);
      assert.equal(writes, 2);
    }
    await page.screenshot({ path: '/tmp/sequo-admin-store-unavailable-mock-http.png', fullPage: true });
    readMode = 'valid'; await click('.merchant-store-editor header button', 'Refresh store'); await page.waitForSelector('.merchant-store-editor form');
    assert.equal(writes, 2); assert.equal(applied, 2); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture: 'LOCAL_MOCK_HTTP_ONLY', checks: ['unconfigured legacy state assumes no timezone/hours', 'incomplete weekly inputs blocked before write', 'overnight ranges rejected', 'review cancellation and deliberate confirmation', 'manual close and exact revision/history readback', 'lost acknowledgement reload resolves canonical history without another PUT', 'malformed read unavailable with no fabricated open state', 'incomplete legacy weekly records denied', 'valid refresh recovers'], writes, applied, recordedChanges: state.history.length, pageErrors: errors.length, screenshots: ['/tmp/sequo-admin-store-editor-mock-http.png', '/tmp/sequo-admin-store-unavailable-mock-http.png'] }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
