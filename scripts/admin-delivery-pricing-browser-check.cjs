/* Actual settings component over isolated mock HTTP. No local workspace or payment provider calls. */
const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const puppeteer = require('puppeteer-core');
(async () => {
  const { createServer } = await import('vite'); const { default: vue } = await import('@vitejs/plugin-vue');
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'sequo-price-browser-'));
  let revision = 'original-revision', writes = [], applications = 0, lost = true, expired = false, readbackFails = false;
  let effective = { minimumDeliveryFeeCfa: 400, extraKmFeeCfa: 100, includedKm: 5 }; let history = [];
  const state = () => ({ revision, effective, profiles: [], history });
  const server = await createServer({ configFile: false, envDir: false, root: process.cwd(), cacheDir: cache,
    server: { host: '127.0.0.1', port: 0, strictPort: true }, plugins: [vue(), {
      name: 'isolated-delivery-price-harness',
      transformIndexHtml() { return '<html><body><div id="app"></div><script type="module" src="/price-harness.js"></script></body></html>' },
      resolveId(id) { return id === '/price-harness.js' ? id : null },
      load(id) { if (id !== '/price-harness.js') return null; return `import {createApp,h} from 'vue';import Panel from '/src/OperationsControlPanel.vue';import '/src/assets/main.css';const request=async(path,_retry,method='GET',body)=>{const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(value.message);return value};createApp({render:()=>h('main',{style:'padding:24px'},[h(Panel,{category:'settings',request,actorId:'price-admin-fixture',roles:['ADMIN']})])}).mount('#app');` },
      configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
        if (!req.url.startsWith('/api/')) return next(); res.setHeader('Content-Type','application/json');
        if (expired) { res.statusCode=401; return res.end(JSON.stringify({message:'Mock session expired; sign in again.'})) }
        if (req.url !== '/api/admin/web/delivery-pricing/manage') { res.statusCode=404; return res.end('{}') }
        if (req.method==='GET') { if(readbackFails) { res.statusCode=503;return res.end(JSON.stringify({message:'Mock price read unavailable'})) } return res.end(JSON.stringify(state())) }
        let raw='';for await(const chunk of req) raw+=chunk;const body=JSON.parse(raw);writes.push(body);
        const previous=history.find(h=>h.idempotencyKey===body.idempotencyKey);
        if(!previous){assert.equal(body.expectedRevision,revision);assert.ok(body.approvalReference);assert.ok(body.reason);applications++;
          effective={minimumDeliveryFeeCfa:body.minimumDeliveryFeeCfa,extraKmFeeCfa:body.extraKmFeeCfa,includedKm:body.includedKm}; revision='changed-revision';
          history=[{id:'price-operation',action:'SET_PRICE',actorUserId:'price-admin-fixture',reason:body.reason,idempotencyKey:body.idempotencyKey,createdAt:'2026-11-08T10:00:00Z'}];
        }
        if(lost){lost=false;res.statusCode=503;return res.end(JSON.stringify({message:'Mock lost price acknowledgement'}))}
        res.end(JSON.stringify({record:state(),operation:history[0]}));
      }) },
    }] });
  let browser;
  try {
    await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1200,height:900});await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.abort());
    const click=async text=>page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!b)throw Error('Missing '+text);b.click()},text);
    const fill=async(label,value)=>page.evaluate((label,value)=>{const field=[...document.querySelectorAll('.action-form label')].find(l=>l.textContent.trim().startsWith(label))?.querySelector('input,textarea');if(!field)throw Error('Missing '+label);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}))},label,value);
    await page.goto(origin);await page.waitForSelector('.resource-table');
    await page.select('select[aria-label="Choose service action"]','set-prices');await page.waitForSelector('.action-form');
    assert.equal(await page.$eval('.action-form input[type=number]',i=>i.value),'400');
    await fill('Minimum delivery price','500');await fill('Additional kilometer price','80');
    await fill('SEQUO approval reference','LOCAL_FIXTURE_ONLY tariff approval');await fill('Reason for this tariff','Mock reviewed price change');
    await click('Review action');await page.waitForSelector('[role=dialog]');await click('Cancel');assert.equal(writes.length,0);
    await click('Review action');await page.waitForSelector('[role=dialog]');await click('Confirm action');
    await page.waitForFunction(()=>document.body.innerText.includes('Mock lost price acknowledgement'));assert.equal(applications,1);
    const original=JSON.stringify(writes[0]);await page.reload();await page.waitForSelector('.pending-action-tools');assert.equal(writes.length,1,'Reload does not resubmit');
    assert.equal(await page.$eval('.action-form fieldset',f=>f.disabled),true);
    await click('Review exact retry');await page.waitForSelector('[role=dialog]');await click('Confirm action');
    await page.waitForFunction(()=>document.body.innerText.includes('server state refreshed')||document.body.innerText.includes('Server state refreshed')||document.body.innerText.includes('Action confirmed'));
    assert.equal(writes.length,2);assert.equal(JSON.stringify(writes[1]),original);assert.equal(applications,1);
    assert.equal(await page.$('.pending-action-tools'),null);
    expired=true;await page.click('[aria-label="Refresh service records"]');await page.waitForFunction(()=>document.body.innerText.includes('Mock session expired'));
    assert.equal(await page.$('.resource-table'),null,'Expired read clears the apparent current tariff');assert.equal(applications,1);assert.deepEqual(errors,[]);
    await page.screenshot({path:'/tmp/sequo-admin-price-mock.png',fullPage:true});
    console.log('PASS: pricing actual Vue editor; prefill, review/cancel, lost acknowledgement, frozen reload, identical retry with one applied change, expired read fail-closed. LOCAL MOCK HTTP ONLY.');
  }finally{if(browser)await browser.close();await server.close();fs.rmSync(cache,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
