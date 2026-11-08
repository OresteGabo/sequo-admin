const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
let expired = false; let challengeReview = true; let rejectGrouping = true; let failReadback = false; let manifests = []; let dispatches = 0;
const history = []; const reviews = []; const creationAttempts = [];
const cooperative = {id:'coop-fixture',name:'Fixture cooperative',code:'FIXTURE',city:'Fixture city',status:'PENDING_REVIEW',members:[{merchantId:'merchant-A'},{merchantId:'merchant-B'}],history:[]};
const record = (action, metadata) => {history.push({action,metadata,actorUserId:'admin-fixture',createdAt:'2026-11-08T00:00:00Z'});};
const server = http.createServer(async (req,res) => {
  if (!req.url.startsWith('/api/')) {
    const file = path.join(process.cwd(),'dist', req.url.startsWith('/assets/') ? req.url : '/index.html');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');res.end(fs.readFileSync(file));return;
  }
  let raw='';for await (const part of req) raw+=part;
  const body=raw ? JSON.parse(raw) : undefined;
  res.setHeader('Content-Type','application/json');
  if (expired) {res.statusCode=401;res.end('{}');return;}
  let result = {};
  if(req.url==='/api/auth/me') result={id:'admin-fixture',email:'fixture@example.invalid',active:true,roles:['ADMIN'],provider:'EMAIL'};
  else if(req.url==='/api/auth/refresh') result={accessToken:'fixture-access-2',refreshToken:'fixture-refresh-2'};
  else if(req.url==='/api/admin/web/deliveries') result={missions:[],merchantSubOrderCounts:{PACKED_READY:2}};
  else if(req.url==='/api/admin/cooperatives') result=[cooperative];
  else if(req.url.endsWith('/review')) {
    assert.equal(req.method,'POST');reviews.push(body);
    if(challengeReview){challengeReview=false;res.statusCode=401;res.end('{}');return;}
    cooperative.status=body.status;cooperative.reviewReason=body.reason;cooperative.reviewedByUserId='admin-fixture';cooperative.reviewedAt='2026-11-08T00:00:00Z';
    cooperative.history.push({action:body.status,metadata:body.reason,actorUserId:'admin-fixture',createdAt:'2026-11-08T00:00:00Z'});result=cooperative;
  }
  else if(req.url==='/api/consolidations' && req.method==='POST') {
    assert.equal(body.orderId,'order-fixture');assert.equal(body.cooperativeId,'coop-fixture');creationAttempts.push(body);
    if(rejectGrouping){rejectGrouping=false;res.statusCode=409;res.end(JSON.stringify({reason:'Packed merchant parts required'}));return;}
    assert.equal(body.customerId,undefined);assert.equal(body.sellerPackages,undefined);
    record('APPROVED_GROUPING','Two prepared merchants verified');
    manifests=[{manifestId:'persisted-manifest-fixture',orderId:body.orderId,customerId:'customer-fixture',status:'ReadyForSequoPickup',approvedByUserId:'admin-fixture',cooperativeId:body.cooperativeId,history,
      sellerPackages:[{subOrderId:'sub-A',merchantId:'merchant-A',packageCount:2,ready:true,collected:false},{subOrderId:'sub-B',merchantId:'merchant-B',packageCount:1,ready:true,collected:false}]}];result=manifests[0];
  }
  else if(req.url==='/api/consolidations') {
    if(failReadback){failReadback=false;res.statusCode=503;res.end(JSON.stringify({message:'Readback temporarily unavailable'}));return;}
    result=manifests;
  }
  else if(req.url.endsWith('/collected')) {
    assert.equal(body.metadata,'Warehouse receipt fixture');
    const part=manifests[0].sellerPackages.find(p=>req.url.includes(`/seller-packages/${p.subOrderId}/`));part.collected=true;record('PACKAGE_RECEIVED',part.subOrderId);
    if(manifests[0].sellerPackages.every(p=>p.collected)) manifests[0].status='InSequoCustody';result=manifests[0];
  }
  else if(req.url.endsWith('/transitions')) {
    assert.equal(body.event,'SequoCreatesFinalPackage');manifests[0].status='Consolidated';manifests[0].finalPackageId=body.finalPackageId;record('FINAL_PACKAGE_SEALED',body.finalPackageId);failReadback=true;result={accepted:true,reason:'Sealed'};
  }
  else if(req.url.endsWith('/dispatch-final-package')) {
    assert.equal(manifests[0].status==='Consolidated'||manifests[0].status==='Dispatched',true);
    if(manifests[0].status!=='Dispatched'){dispatches++;record('FINAL_DISPATCH','One final mission');}
    manifests[0].status='Dispatched';result={manifest:manifests[0],mission:{id:'final-mission'},alreadyDispatched:dispatches>0};
  }
  else if(req.url.startsWith('/api/consolidations/')) {
    assert.equal(req.url,`/api/consolidations/${manifests[0].manifestId}`);result=manifests[0];
  }
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
    await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('sequo_admin_access_token','fixture-access');sessionStorage.setItem('sequo_admin_refresh_token','fixture-refresh');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const deliveries=()=>[...document.querySelectorAll('.nav-button strong')].find(b=>b.textContent.trim()==='Deliveries').closest('button').click();
    await page.waitForSelector('.nav-button strong');await page.evaluate(deliveries);
    await page.waitForFunction(()=>document.body.innerText.includes('Fixture cooperative'));
    const input=async(label,value)=>{await page.evaluate((label)=>{const node=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith(label)).querySelector('input');node.dataset.testInput='selected';},label);await page.type('[data-test-input="selected"]',value);await page.$eval('[data-test-input="selected"]',n=>delete n.dataset.testInput);};
    const click=async(text)=>page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text).click(),text);
    await input('Decision reason','Merchants verified at fixture location');await click('Approve cooperative');
    await page.waitForFunction(()=>document.body.innerText.includes('Fixture cooperative · APPROVED'));
    assert.equal(reviews.length,2);assert.deepEqual(reviews[0],reviews[1]);
    await input('Paid order ID','order-fixture');await page.select('.consolidation-operations select','coop-fixture');await click('Validate grouping');
    await page.waitForFunction(()=>document.body.innerText.includes('Packed merchant parts required'));
    assert.equal(await page.$eval('.consolidation-operations',n=>n.textContent.includes('APPROVED_GROUPING')),false);
    await click('Validate grouping');await page.waitForFunction(()=>document.body.innerText.includes('APPROVED_GROUPING'));assert.deepEqual(creationAttempts[0],creationAttempts[1]);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Dispatch final package').disabled),true);
    await input('Physical receipt reference','Warehouse receipt fixture');
    await click('Confirm SEQUO receipt');await page.waitForFunction(()=>document.querySelector('.consolidation-operations')?.textContent.includes('Received by SEQUO'));
    await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh grouping')?.disabled);
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Confirm SEQUO receipt'&&!b.disabled).click());
    await page.waitForFunction(()=>document.body.innerText.includes('InSequoCustody'));
    await input('Final package ID','FINAL-PACKAGE-FIXTURE');await click('Seal final package');
    await page.waitForFunction(()=>document.body.innerText.includes('The action was saved, but readback failed.'));
    assert.equal(await page.$eval('.consolidation-operations',n=>n.textContent.includes('FINAL_PACKAGE_SEALED')),false);
    await click('Refresh grouping');await page.waitForFunction(()=>document.body.innerText.includes('Consolidated'));
    await click('Dispatch final package');await page.waitForFunction(()=>document.body.innerText.includes('FINAL_DISPATCH'));
    await click('Verify final dispatch');await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Verify final dispatch').disabled);assert.equal(dispatches,1);
    await page.reload();await page.waitForSelector('.nav-button strong');await page.evaluate(deliveries);await page.waitForFunction(()=>document.body.innerText.includes('order-fixture'));
    await page.evaluate(()=>[...document.querySelectorAll('.consolidation-operations button')].find(b=>b.textContent.includes('order-fixture')).click());
    await page.waitForFunction(()=>document.body.innerText.includes('FINAL_DISPATCH'));assert.ok(await page.$eval('.consolidation-operations',n=>n.textContent.includes('admin-fixture')));
    await page.screenshot({path:'/tmp/sequo-task17-admin.png',fullPage:true});
    expired=true;await click('Refresh grouping');await page.waitForFunction(()=>!document.body.innerText.includes('FINAL_DISPATCH'));
    assert.deepEqual(errors,[]);console.log('PASS: cooperative approval with JSON-preserving auth refresh, rejected grouping with stable retry ID and server-returned manifest ID, grouping derived server-side, both receipts, prerequisite guards, saved-action/readback failure recovery, sealing, one final dispatch, actor history after reload and expired-session clearing. Mock HTTP only.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
