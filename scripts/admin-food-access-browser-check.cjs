/* LOCAL MOCK HTTP REGRESSION ONLY. No real accounts, providers, staging or production calls. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const revision = '2026-11-08T08:00:00.123456Z';
const initialMenu = [
  { id: 'group-size', productId: 'food-fixture', name: 'Size', minChoices: 1, maxChoices: 1, sortOrder: 0, active: true, options: [
    { id: 'option-regular', name: 'Regular', priceDeltaCfa: 0, sortOrder: 0, active: true },
    { id: 'option-large', name: 'Large', priceDeltaCfa: 300, sortOrder: 1, active: false },
  ] },
  { id: 'group-extras', productId: 'food-fixture', name: 'Extras', minChoices: 0, maxChoices: 1, sortOrder: 1, active: false, options: [
    { id: 'option-cheese', name: 'Cheese', priceDeltaCfa: 150, sortOrder: 0, active: false },
  ] },
];
const clone = value => JSON.parse(JSON.stringify(value));
let menu = clone(initialMenu);
let menuWrites = 0;
let menuApplied = 0;
let loseMenuAcknowledgement = true;
let accessWrites = 0;
let roleApplied = 0;
let accessApplied = 0;
let accessHistory = [];
let target = { id: 'target-user', displayName: 'LOCAL MOCK HTTP target account', email: 'target@fixture.invalid', phoneNumber: null, provider: 'EMAIL', status: 'ACTIVE', active: true, roles: ['CUSTOMER'], updatedAt: revision };
const errors = [];
const requests = [];
const jsonBody = async req => { let raw = ''; for await (const chunk of req) raw += chunk; return JSON.parse(raw); };
const accessRecord = () => ({ user: clone(target), memberships: [], history: clone(accessHistory) });
const staticRoot = path.resolve(process.cwd(), 'dist');
assert.ok(fs.existsSync(path.join(staticRoot, 'index.html')), 'Build the latest same-origin fixture bundle first.');
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
    requests.push({ method: req.method, path: url.pathname, query: url.search });
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const ordinary = req.headers.authorization === 'Bearer fixture-admin-access';
    let result;
    if (url.pathname === '/api/auth/me') result = { id: ordinary ? 'fixture-admin' : 'fixture-super', displayName: ordinary ? 'LOCAL MOCK HTTP ADMIN' : 'LOCAL MOCK HTTP SUPER ADMIN', email: 'operator@fixture.invalid', provider: 'EMAIL', status: 'ACTIVE', active: true, roles: ordinary ? ['ADMIN'] : ['ADMIN', 'SUPER_ADMIN'] };
    else if (url.pathname === '/api/admin-auth/development-access') result = { enabled: false, mode: 'DISABLED' };
    else if (url.pathname === '/api/admin/web/overview') result = { totals: { orders: 0, merchants: 0, users: 1, activeDeliveries: 0 } };
    else if (url.pathname === '/api/admin/monitoring/operations') result = { generatedAt: revision, merchantFulfillment: { sellerBacklog: 0, readyForPickup: 0 }, deliveryCapacity: { activeMissions: 0, pausedCouriers: 0, problemMissions: [] }, relayOperations: { delayedParcels: 0, problemParcels: 0 }, returnBottlenecks: { returnsWaitingRelayAction: 0, returnsWaitingSequoCollection: 0, returnsInProblem: 0 }, payoutQueue: { merchantPayoutCandidates: 0 } };
    else if (url.pathname === '/api/admin/web/orders' || url.pathname === '/api/admin/web/merchants') result = [];
    else if (url.pathname === '/api/admin/web/users') result = [clone(target)];
    else if (url.pathname === '/api/catalog/products') result = [{ id: 'food-fixture', merchantId: 'merchant-fixture', name: 'LOCAL MOCK HTTP FOOD', kind: 'SellerSpecific', status: 'INACTIVE', category: 'Food', priceCfa: 1200, bargainingEnabled: false }];
    else if (url.pathname === '/api/catalog/products/food-fixture/customizations' && req.method === 'GET') {
      assert.equal(url.searchParams.get('includeInactive'), 'true', 'Editor must load full inactive menu'); result = clone(menu);
    } else if (url.pathname === '/api/catalog/products/food-fixture/customizations' && req.method === 'PUT') {
      const body = await jsonBody(req); menuWrites++;
      assert.deepEqual(body.groups.map(group => group.id), ['group-size', 'group-extras']);
      assert.deepEqual(body.groups.flatMap(group => group.options.map(option => option.id)), ['option-regular', 'option-large', 'option-cheese']);
      assert.equal(body.groups[1].active, false, 'Unavailable group must be retained');
      assert.equal(body.groups[1].options[0].active, false, 'Unavailable option must be retained');
      assert.equal(body.groups[0].options[0].priceDeltaCfa, 400);
      menu = body.groups.map(group => ({ ...group, productId: 'food-fixture' })); menuApplied++;
      if (loseMenuAcknowledgement) { loseMenuAcknowledgement = false; res.writeHead(503).end(JSON.stringify({ message: 'LOCAL MOCK HTTP interrupted save acknowledgement' })); return; }
      result = clone(menu);
    } else if (url.pathname === '/api/admin/web/users/target-user/access' && req.method === 'GET') result = accessRecord();
    else if ((url.pathname === '/api/admin/web/users/target-user/roles/SUPPORT_AGENT' || url.pathname === '/api/admin/web/users/target-user/access') && req.method === 'PUT') {
      accessWrites++;
      if (ordinary) { res.writeHead(403).end(JSON.stringify({ message: 'SUPER_ADMIN is required' })); return; }
      const body = await jsonBody(req);
      assert.equal(body.expectedUpdatedAt, target.updatedAt, 'Nested user.updatedAt precision must survive the UI unchanged');
      assert.match(body.idempotencyKey, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
      assert.equal(typeof body.reason, 'string'); assert.ok(body.reason.trim());
      assert.ok(!Object.hasOwn(body, 'actorUserId')); assert.ok(!Object.hasOwn(body, 'authorizationVersion'));
      const before = clone(target);
      if (url.pathname.endsWith('/SUPPORT_AGENT')) { target.roles = ['CUSTOMER', 'SUPPORT_AGENT']; roleApplied++; }
      else { assert.equal(body.active, false); assert.equal(body.status, 'SUSPENDED'); target.active = false; target.status = 'SUSPENDED'; accessApplied++; }
      target.updatedAt = accessApplied ? '2026-11-08T08:02:00.123456Z' : '2026-11-08T08:01:00.123456Z';
      const operation = { id: `access-operation-${accessWrites}`, action: accessApplied ? 'SET_ACCESS' : 'GRANT_ROLE', actorUserId: 'fixture-super', beforeValue: JSON.stringify({ active: before.active, roles: before.roles }), afterValue: JSON.stringify({ active: target.active, roles: target.roles }), reason: body.reason, idempotencyKey: body.idempotencyKey, createdAt: target.updatedAt };
      accessHistory.unshift(operation); result = { record: accessRecord(), operation };
    } else { res.statusCode = 404; result = { message: 'LOCAL MOCK HTTP route not configured' }; }
    res.end(JSON.stringify(result));
  } catch (error) { errors.push(`Fixture contract: ${error.message}`); res.writeHead(500).end(JSON.stringify({ message: 'LOCAL MOCK HTTP contract assertion failed' })); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function open(token) {
    const context = await browser.createBrowserContext(); const page = await context.newPage();
    page.setDefaultTimeout(12000); await page.setViewport({ width: 1440, height: 1080 });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true); page.on('request', request => request.url().startsWith(origin) ? request.continue() : request.abort());
    await page.evaluateOnNewDocument(token => { sessionStorage.setItem('sequo_admin_access_token', token); sessionStorage.setItem('sequo_admin_refresh_token', 'LOCAL_MOCK_HTTP_REFRESH'); }, token);
    await page.goto(origin); await page.waitForSelector('.sidebar'); return page;
  }
  async function click(page, selector, text) {
    await page.evaluate((selector, text) => { const element = [...document.querySelectorAll(selector)].find(item => item.textContent.trim().includes(text)); if (!element) throw new Error(`Missing control ${text}`); element.click(); }, selector, text);
  }
  async function field(page, root, label, value) {
    await page.evaluate((root, label, value) => {
      const container = [...document.querySelectorAll(`${root} label`)].find(item => item.textContent.trim().startsWith(label));
      if (!container) throw new Error(`Missing field ${label}`);
      const input = container.querySelector('input,textarea,select');
      if (!input) throw new Error(`Missing input ${label}`);
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }, root, label, value);
  }
  async function menuWorkspace(page) {
    await click(page, '.nav-button', 'Catalog'); await click(page, '.service-tab', 'Food options and supplements');
    await field(page, '.control-filter-grid', 'Product ID', 'food-fixture'); await click(page, '.control-filter-grid button', 'Load records');
    await page.waitForSelector('.catalog-options-editor .option-group');
  }
  async function userWorkspace(page) {
    await click(page, '.nav-button', 'Users');
    await page.waitForSelector('.users-row button'); await click(page, '.users-row button', 'Manage access');
    await page.waitForFunction(() => document.querySelector('.control-workspace h3')?.textContent.includes('Account access and roles'));
    await page.waitForSelector('.resource-table tbody tr');
  }
  try {
    const page = await open('fixture-super-access');
    await menuWorkspace(page);
    assert.equal(await page.$$eval('.catalog-options-editor .option-group', nodes => nodes.length), 2);
    assert.equal(await page.$eval('.catalog-options-editor .option-group:nth-of-type(2) input[type=checkbox]', input => input.checked), false);
    await field(page, '.catalog-options-editor .option-group', 'Minimum choices', '2');
    await click(page, '.catalog-options-editor form button', 'Review menu changes');
    await page.waitForFunction(() => document.querySelector('.catalog-options-editor .error-text')?.textContent.includes('minimum must not exceed maximum'));
    assert.equal(menuWrites, 0);
    await field(page, '.catalog-options-editor .option-group', 'Minimum choices', '1');
    await field(page, '.catalog-options-editor .option-row', 'Supplement (CFA)', '-1');
    await click(page, '.catalog-options-editor form button', 'Review menu changes');
    assert.equal(await page.$eval('.catalog-options-editor .option-row input[type=number]', input => input.checkValidity()), false);
    assert.equal(menuWrites, 0, 'Invalid negative price never sends a write');
    await field(page, '.catalog-options-editor .option-row', 'Supplement (CFA)', '400');
    await click(page, '.catalog-options-editor form button', 'Review menu changes');
    await page.waitForSelector('[aria-label="Confirm product options"]');
    await click(page, '[aria-label="Confirm product options"] button', 'Confirm and save menu');
    await page.waitForSelector('[aria-label="Unconfirmed menu change"]');
    assert.equal(menuWrites, 1); assert.equal(menuApplied, 1);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('sequo_catalog_options_pending:fixture-super:')).length), 1);
    await page.reload(); await page.waitForSelector('.sidebar');
    assert.equal(menuWrites, 1, 'Reload must never automatically repeat the lost-response save');
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('sequo_catalog_options_pending:fixture-super:')).length), 1);
    await menuWorkspace(page);
    await page.waitForFunction(() => document.querySelector('.catalog-options-editor')?.textContent.includes('server confirms the reviewed menu'));
    assert.equal(menuWrites, 1); assert.equal(menuApplied, 1);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('sequo_catalog_options_pending:fixture-super:')).length), 0);
    await click(page, '.catalog-options-editor form button', 'Review menu changes');
    await click(page, '[aria-label="Confirm product options"] button', 'Confirm and save menu');
    await page.waitForFunction(() => document.querySelector('.catalog-options-editor')?.textContent.includes('confirmed by server readback'));
    assert.equal(menuWrites, 1, 'Matching preflight confirms the unchanged reviewed menu without another PUT');
    assert.equal(menuApplied, 1);
    await page.screenshot({ path: '/tmp/sequo-admin-food-editor-mock-http.png', fullPage: true });

    await userWorkspace(page);
    await page.select('[aria-label="Choose service action"]', 'grant-role');
    await field(page, '.action-form', 'Account role', 'SUPPORT_AGENT'); await field(page, '.action-form', 'Role change reason', 'LOCAL MOCK HTTP approved role');
    await click(page, '.action-form button', 'Review action'); await page.waitForSelector('.confirm-dialog');
    assert.ok(await page.$eval('.confirm-dialog', node => node.textContent.includes('SUPPORT_AGENT')));
    await click(page, '.confirm-dialog button', 'Confirm action');
    await page.waitForFunction(() => document.querySelector('.notice-text')?.textContent.includes('Action confirmed'));
    assert.equal(roleApplied, 1); assert.equal(accessWrites, 1);
    assert.ok(await page.$eval('.control-workspace', node => node.textContent.includes('SUPPORT_AGENT') || node.textContent.includes('Support agent')));
    await click(page, '.action-form button', 'Start another action');
    await page.select('[aria-label="Choose service action"]', 'access');
    await field(page, '.action-form', 'Account active', 'false');
    await field(page, '.action-form', 'Account status', 'SUSPENDED'); await field(page, '.action-form', 'Access change reason', 'LOCAL MOCK HTTP suspend target');
    await click(page, '.action-form button', 'Review action'); await page.waitForSelector('.confirm-dialog');
    assert.ok(await page.$eval('.confirm-dialog', node => node.textContent.includes('SUSPENDED')));
    await click(page, '.confirm-dialog button', 'Confirm action');
    await page.waitForFunction(() => document.querySelector('.notice-text')?.textContent.includes('Action confirmed'));
    assert.equal(accessApplied, 1); assert.equal(accessWrites, 2); assert.equal(target.active, false);
    await page.screenshot({ path: '/tmp/sequo-admin-access-editor-mock-http.png', fullPage: true });

    const ordinary = await open('fixture-admin-access'); await userWorkspace(ordinary);
    await ordinary.select('[aria-label="Choose service action"]', 'grant-role');
    assert.equal(await ordinary.$eval('.action-form fieldset', fieldset => fieldset.disabled), true);
    await click(ordinary, '.action-form button', 'Review action');
    assert.equal(await ordinary.$('.confirm-dialog'), null);
    assert.equal(accessWrites, 2, 'Ordinary ADMIN cannot submit SUPER_ADMIN changes');
    assert.equal(roleApplied, 1); assert.equal(accessApplied, 1);
    assert.deepEqual(errors, []);
    assert.ok(requests.some(request => request.path.endsWith('/users/target-user/access') && request.method === 'GET'), 'Role/access results are read back from HTTP');
    console.log(JSON.stringify({ fixture: 'LOCAL_MOCK_HTTP_ONLY', checks: ['full inactive menu and IDs retained', 'invalid choice and negative price blocked before write', 'lost acknowledgement survives reload', 'matching preflight prevents duplicate PUT', 'Users Manage access resolves nested user identity and exact revision', 'SUPER_ADMIN role and access readback', 'ordinary ADMIN cannot submit'], menuWrites, menuApplied, accessWrites, roleApplied, accessApplied, pageErrors: errors.length, screenshots: ['/tmp/sequo-admin-food-editor-mock-http.png', '/tmp/sequo-admin-access-editor-mock-http.png'] }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
