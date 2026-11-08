/* LOCAL MOCK HTTP ONLY: ephemeral Vite dev app + production dist, no actual seed, account or provider. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const requests = [];
const errors = [];
let badManifest = false;
const at = '2026-11-08T10:00:00.123456Z';
const manifest = () => ({ environment: 'LOCAL_FIXTURE', namespace: 'local-ops-v1', version: 1, seededAt: at,
  accounts: Array.from({ length: 15 }, (_, i) => ({ id: `fixture-user-${i}`, name: `LOCAL MOCK customer ${i}`, email: `customer${i}@fixture.invalid`, roles: ['CUSTOMER'], purpose: 'Named local test identity' })),
  scenarios: Array.from({ length: 26 }, (_, i) => {
    const category = ['catalog', 'relay', 'orders', 'returns'][i % 4];
    const resourceIds = category === 'relay' ? { parcelId: `fixture-parcel-${i}`, relayPointId: 'fixture-site' } : category === 'catalog' ? { productId: `fixture-product-${i}` } : category === 'orders' ? { orderId: `fixture-order-${i}` } : { returnId: `fixture-return-${i}` };
    return { id: `fixture-scene-${i}`, title: `LOCAL MOCK scene ${i}`, summary: `Seed-time ${category} practice example.`, category, resourceIds, nextActions: ['Read the current record before acting.'], credentials: category === 'relay' ? (badManifest ? { accessToken: 'SENTINEL_MUST_NOT_RENDER' } : { pickupCode: '123456', qrNonce: 'local-proof-nonce' }) : {} };
  }), note: 'LOCAL MOCK HTTP: descriptions are original seed metadata; no real payments.' });
function respond(req, res, source) {
  const url = new URL(req.url, 'http://fixture');
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const outsider = req.headers.authorization === 'Bearer fixture-customer';
  requests.push({ source, path: url.pathname, method: req.method, outsider });
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  let value;
  if (url.pathname === '/api/auth/me') value = { id: outsider ? 'outsider-fixture' : 'admin-fixture', displayName: 'LOCAL MOCK HTTP operator', email: 'operator@fixture.invalid', provider: 'EMAIL', status: 'ACTIVE', active: true, roles: outsider ? ['CUSTOMER'] : ['ADMIN'] };
  else if (url.pathname === '/api/admin-auth/development-access') value = { enabled: true, mode: 'LOCAL_DEVELOPMENT' };
  else if (url.pathname === '/api/admin/local-fixtures') {
    if (!req.headers.authorization || outsider) { res.writeHead(403).end(JSON.stringify({ message: 'Admin role required' })); return; }
    value = manifest();
  } else if (url.pathname === '/api/admin/web/overview') value = { totals: { orders: 0, merchants: 0, users: 15, activeDeliveries: 0 } };
  else if (url.pathname === '/api/admin/monitoring/operations') value = { generatedAt: at, merchantFulfillment: { sellerBacklog: 0, readyForPickup: 0 }, deliveryCapacity: { activeMissions: 0, pausedCouriers: 0, problemMissions: [] }, relayOperations: { delayedParcels: 0, problemParcels: 0 }, returnBottlenecks: { returnsWaitingRelayAction: 0, returnsWaitingSequoCollection: 0, returnsInProblem: 0 }, payoutQueue: { merchantPayoutCandidates: 0 } };
  else if (url.pathname === '/api/admin/web/orders' || url.pathname === '/api/admin/web/users' || url.pathname === '/api/admin/web/merchants') value = [];
  else if (url.pathname === '/api/admin/web/relay') value = { parcels: [], storageFeeAssessmentCount: 0 };
  else if (url.pathname === '/api/relay/parcels/sites') value = [{ id: 'fixture-site', name: 'LOCAL MOCK relay', canReturnToSeller: true }];
  else if (url.pathname === '/api/relay/parcels/fixture-parcel-1') value = { id: 'fixture-parcel-1', relayPointId: 'fixture-site', status: 'Deposited', depositedAt: at, pickedUpAt: null, collectedAt: null, history: [], createdAt: at, updatedAt: at };
  else { res.statusCode = 404; value = { message: 'LOCAL MOCK route not configured' }; }
  res.end(JSON.stringify(value));
}
const api = http.createServer((req, res) => respond(req, res, 'DEV_API'));
const staticRoot = path.resolve(process.cwd(), 'dist');
const production = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture');
  if (url.pathname.startsWith('/api/')) { respond(req, res, 'PRODUCTION'); return; }
  const relative = /^\/(assets|brand)\//.test(url.pathname) ? url.pathname.slice(1) : 'index.html';
  const file = path.resolve(staticRoot, relative);
  if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  const devOnly = process.argv.includes('--dev-only');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sequo-guide-browser-'));
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  process.env.NODE_ENV = 'development';
  const { createServer } = await import('vite'); const { default: vue } = await import('@vitejs/plugin-vue');
  const vite = await createServer({ root: process.cwd(), cacheDir, configFile: false, envDir: false, plugins: [vue()], resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } }, define: { 'import.meta.env.VITE_SEQUO_API_BASE_URL': JSON.stringify(apiOrigin) }, server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: { ignored: ['**/.local-workspace/**'] } } });
  await vite.listen();
  const devOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  if (!devOnly) { assert.ok(fs.existsSync(path.join(staticRoot, 'index.html')), 'Latest same-origin production dist is required.'); await new Promise(resolve => production.listen(0, '127.0.0.1', resolve)); }
  const prodOrigin = devOnly ? null : `http://127.0.0.1:${production.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  async function open(origin, token) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1440, height: 1000 }); page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true); page.on('request', request => [devOrigin, apiOrigin, prodOrigin].filter(Boolean).some(base => request.url().startsWith(base)) ? request.continue() : request.abort());
    if (token) await page.evaluateOnNewDocument(token => { sessionStorage.setItem('sequo_admin_access_token', token); sessionStorage.setItem('sequo_admin_refresh_token', 'LOCAL_MOCK_HTTP_REFRESH'); }, token);
    await page.goto(origin); return page;
  }
  async function click(page, selector, text) {
    await page.evaluate((selector, text) => { const node = [...document.querySelectorAll(selector)].find(item => item.textContent.trim().includes(text)); if (!node) throw new Error(`Missing ${text}`); node.click(); }, selector, text);
  }
  const guideReads = source => requests.filter(row => row.path === '/api/admin/local-fixtures' && (!source || row.source === source)).length;
  try {
    const anonymous = await open(devOrigin); await anonymous.waitForSelector('.auth-shell');
    assert.equal(await anonymous.$('.local-fixture-guide'), null); assert.equal(guideReads(), 0);
    const outsider = await open(devOrigin, 'fixture-customer'); await outsider.waitForSelector('.auth-shell .error-text');
    assert.equal(await outsider.$('.local-fixture-guide'), null); assert.equal(guideReads(), 0, 'Non-admin sessions never read the manifest');
    const page = await open(devOrigin, 'fixture-admin'); await page.waitForSelector('.local-fixture-guide .fixture-browse');
    assert.equal(await page.$eval('.fixture-browse', element => element.open), false);
    assert.equal(await page.$eval('.fixture-accounts', element => element.open), false);
    assert.ok(await page.$eval('.fixture-accounts > summary', element => element.textContent.includes('15')));
    assert.ok(await page.$eval('.local-fixture-guide', element => element.textContent.includes('26 scenarios')));
    await click(page, '.fixture-browse > summary', 'Browse practice scenarios');
    assert.equal(await page.$$eval('.fixture-scenario', cards => cards.length), 26);
    await page.select('[aria-label="Filter practice category"]', 'relay');
    assert.equal(await page.$$eval('.fixture-scenario', cards => cards.length), 7);
    await page.type('[aria-label="Search practice scenarios"]', 'fixture-parcel-1');
    await page.waitForFunction(() => document.querySelectorAll('.fixture-scenario').length === 3);
    // The unique visible title narrows the same search without issuing a server mutation.
    await page.$eval('[aria-label="Search practice scenarios"]', input => { input.value = 'LOCAL MOCK scene 1 '; input.dispatchEvent(new Event('input', { bubbles: true })); });
    // Search all meaningful record IDs for an exact isolated example.
    await page.$eval('[aria-label="Search practice scenarios"]', input => { input.value = 'local-proof-nonce-does-not-match'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelectorAll('.fixture-scenario').length === 0);
    assert.ok(await page.$eval('.fixture-browse', element => element.textContent.includes('No scenarios match')));
    await page.$eval('[aria-label="Search practice scenarios"]', input => { input.value = 'fixture-parcel-1'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelectorAll('.fixture-scenario').length === 3);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Fixture clipboard permission denied'); } } }));
    await click(page, '.fixture-scenario:first-child .fixture-credentials > summary', 'Seed-time local proof values');
    assert.ok(await page.$eval('.fixture-scenario:first-child .fixture-credentials', element => element.textContent.includes('expire or be used once') && element.textContent.includes('refreshing does not renew')));
    await click(page, '.fixture-scenario:first-child .fixture-credentials button', 'Copy');
    await page.waitForFunction(() => document.querySelector('.local-fixture-guide')?.textContent.includes('Copy is unavailable'));
    assert.equal(requests.filter(row => row.method !== 'GET').length, 0, 'Browsing/copy failure cannot seed, issue codes or write records');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/sequo-local-fixture-guide-mock-http.png', fullPage: true });
    await click(page, '.fixture-scenario:first-child > button', 'Open Relay');
    await page.waitForFunction(() => location.hash === '#relay');
    await page.waitForFunction(() => document.querySelector('.control-workspace')?.textContent.includes('fixture-parcel-1'));
    assert.ok(requests.some(row => row.path === '/api/relay/parcels/fixture-parcel-1'));
    await click(page, '.nav-button', 'Overview'); await page.waitForSelector('.local-fixture-guide .fixture-browse');
    badManifest = true; await click(page, '.local-fixture-guide header button', 'Refresh guide');
    await page.waitForSelector('.local-fixture-guide .error-text');
    assert.equal(await page.$$eval('.fixture-scenario', cards => cards.length), 0);
    assert.equal(await page.$eval('body', element => element.textContent.includes('SENTINEL_MUST_NOT_RENDER')), false);
    if (!devOnly) {
      const before = guideReads('PRODUCTION'); const prod = await open(prodOrigin, 'fixture-production'); await prod.waitForSelector('.sidebar');
      assert.equal(await prod.$('.local-fixture-guide'), null); assert.equal(guideReads('PRODUCTION'), before, 'Production bundle never requests fixture data even when capability mock says enabled');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture: 'LOCAL_MOCK_HTTP_ONLY', checks: ['anonymous/non-admin manifest denial in UI', 'development-only guide', '26 scenes and15 accounts collapsed', 'category/search/no-results', 'seed-time one-use code wording', 'clipboard failure state', 'open exact linked resource', 'malformed credential manifest hidden', ...(devOnly ? [] : ['production guide unmounted/no manifest read'])], scenarios: 26, accounts: 15, mutations: requests.filter(row => row.method !== 'GET').length, pageErrors: errors.length, productionVerified: !devOnly, screenshot: '/tmp/sequo-local-fixture-guide-mock-http.png' }, null, 2));
  } finally { await browser.close(); await vite.close(); fs.rmSync(cacheDir, { recursive: true, force: true }); await new Promise(resolve => api.close(resolve)); if (production.listening) await new Promise(resolve => production.close(resolve)); }
})().catch(error => { console.error(error); api.close(); production.close(); process.exitCode = 1; });
