const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http'); const assert = require('node:assert/strict'); const puppeteer = require('puppeteer-core');
let expired = false; let nonAdmin = false; let queueEmpty = false; let failDetail = false; let mode = 'pending';
const checkout = (id = 'checkout-fixture') => ({ checkoutId: id, paymentProvider: 'yas_togo', paymentReference: `payment-${id}`, providerReference: mode === 'completed' ? 'provider-fixture' : null,
  amountCfa: 4500, currency: 'XOF', status: mode === 'completed' ? 'COMPLETED' : 'AWAITING_WEBHOOK', createdAt: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T11:00:00Z', completedAt: mode === 'completed' ? '2026-11-08T11:00:00Z' : null,
  orderId: mode === 'completed' ? 'persisted-order-37' : null, orderStatus: mode === 'completed' ? 'ACCEPTED_FOR_FULFILLMENT' : null });
const event = (outcome, reason) => ({ id: `event-${outcome}`, provider: 'yas_togo', eventId: `event-${outcome}`, checkoutId: 'checkout-fixture', paymentReference: 'payment-checkout-fixture', providerReference: 'provider-fixture', amountCfa: 4500, status: 'VALIDATED', occurredAt: '2026-11-08T11:00:00Z', receivedAt: '2026-11-08T11:00:01Z', reconciliationStatus: outcome, reconciliationReason: reason, reconciledAt: outcome === 'LEGACY_REVIEW_REQUIRED' ? null : '2026-11-08T11:00:02Z' });
const events = () => mode === 'pending' ? [] : mode === 'completed' ? [event('FULFILLED', 'order_fulfilled')] : [event('IGNORED', 'amount_mismatch'), event('REVIEW_REQUIRED', 'terminal_checkout_conflict'), event('ERROR', 'processing_failed'), event('LEGACY_REVIEW_REQUIRED', null)];
const server = http.createServer((req, res) => {
  if (!req.url.startsWith('/api/')) { const file = path.join(process.cwd(), 'dist', req.url.startsWith('/assets/') ? req.url : '/index.html'); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); return; }
  res.setHeader('Content-Type', 'application/json'); assert.equal(req.method, 'GET', 'Investigation must never write payment state');
  if (expired) { res.statusCode = 401; res.end('{}'); return; }
  assert.ok(req.headers.authorization?.startsWith('Bearer ')); let result = {};
  if (req.url === '/api/auth/me') result = { id: 'admin-fixture', email: 'fixture@example.invalid', active: true, roles: [nonAdmin ? 'CUSTOMER' : 'ADMIN'], provider: 'EMAIL' };
  else if (req.url === '/api/admin/web/payments') result = { merchantPayouts: [], webhookEvents: events(), checkouts: queueEmpty ? [] : [checkout()] };
  else if (req.url.startsWith('/api/admin/web/payments/checkouts/')) {
    const id = decodeURIComponent(req.url.split('/').at(-1));
    if (failDetail) { res.statusCode = 503; res.end('{}'); return; }
    if (!['checkout-fixture', 'old-record'].includes(id)) { res.statusCode = 404; res.end('{}'); return; }
    result = { checkout: checkout(id), events: id === 'checkout-fixture' ? events() : [] };
  }
  res.end(JSON.stringify(result));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 1300 }); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true); page.on('request', request => request.url().startsWith('http://127.0.0.1:') ? request.continue() : request.abort());
    await page.evaluateOnNewDocument(() => { sessionStorage.setItem('sequo_admin_access_token', 'fixture-access'); });
    const root = `http://127.0.0.1:${server.address().port}/`;
    const navigate = async () => { await page.waitForSelector('.nav-button strong'); await page.evaluate(() => [...document.querySelectorAll('.nav-button strong')].find(node => node.textContent === 'Payments').closest('button').click()); await page.waitForSelector('.payment-investigation'); await page.waitForFunction(() => !document.querySelector('.payment-investigation > button')?.disabled); };
    const lookup = async id => { await page.$eval('.payment-investigation input', (node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); }, id); await page.click('.payment-investigation form button'); await page.waitForFunction(() => !document.querySelector('.payment-investigation form button')?.disabled); };
    await page.goto(root); await navigate(); assert.ok(await page.$eval('.checkout-queue', node => node.textContent.includes('Awaiting webhook'))); await lookup('checkout-fixture');
    assert.ok(await page.$eval('.checkout-detail', node => node.textContent.includes('No callback events recorded') && node.textContent.includes('No order linked')));
    mode = 'investigate'; await lookup('checkout-fixture');
    assert.ok(await page.$eval('.checkout-detail', node => ['No state change', 'Amount mismatch', 'Operator review required', 'Processing failed', 'Legacy outcome requires review', 'No order linked'].every(text => node.textContent.includes(text))));
    await (await page.$('.payment-investigation')).screenshot({ path: '/tmp/sequo-task25-admin-payments.png' });
    mode = 'completed'; await lookup('checkout-fixture'); assert.ok(await page.$eval('.checkout-detail', node => node.textContent.includes('persisted-order-37') && node.textContent.includes('Fulfillment recorded')));
    await page.reload(); await navigate(); await lookup('checkout-fixture'); assert.ok(await page.$eval('.checkout-detail', node => node.textContent.includes('persisted-order-37')));
    failDetail = true; await lookup('checkout-fixture'); assert.equal(await page.$('.checkout-detail'), null); assert.ok(await page.$('.payment-investigation .error-text')); failDetail = false;
    queueEmpty = true; await page.click('.payment-investigation > button'); await page.waitForFunction(() => document.querySelector('.payment-investigation')?.textContent.includes('No checkouts recorded.')); await lookup('old-record'); assert.ok(await page.$eval('.checkout-detail', node => node.textContent.includes('old-record')));
    await lookup('missing'); assert.equal(await page.$('.checkout-detail'), null);
    expired = true; await lookup('checkout-fixture'); await page.waitForFunction(() => !document.querySelector('.payment-investigation')); expired = false; nonAdmin = true;
    await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('not allowed') || document.body.innerText.includes('Only SEQUO')); assert.equal(await page.$('.payment-investigation'), null);
    const missing = await browser.newPage(); await missing.goto(root); await missing.waitForSelector('input[type="email"]'); assert.equal(await missing.$('.payment-investigation'), null); await missing.close();
    assert.deepEqual(errors, []); console.log('PASS: authenticated checkout without callback, distinct ignored/review/error/legacy outcomes, actual order link, reload readback, failed vs empty state, exact older lookup, missing record, expired/missing/non-admin sessions, no payment writes. Local mock HTTP only.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
