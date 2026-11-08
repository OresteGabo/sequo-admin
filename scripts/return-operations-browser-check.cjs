const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const now = '2026-11-08T12:00:00Z';
const makeReturn = (id, status) => ({id,orderId:`order-${id}`,customerId:'customer-fixture',status,reason:'Wrong size fixture',requestedAt:now,requestedRefundCfa:3000,relayPointId:'relay-fixture',droppedAt:now,receivedBySequoAt:status==='ReceivedBySequo'?now:null,receivingOperatorId:status==='ReceivedBySequo'?'legacy-operator':null,conditionAssessment:status==='ReceivedBySequo'?'Legacy receipt; inspection pending':null,responsibility:null,refundAmountCfa:null,updatedAt:now,collectedBySequoAt:null,collectingOperatorId:null,inspectionDecision:null,inspectedAt:null,inspectingOperatorId:null,refundInstruction:null,refundDeadlineState:'UNCONFIGURED',refundDueAt:null,history:[]});
const returns = [makeReturn('return-fixture','DroppedAtRelay'),makeReturn('return-legacy','ReceivedBySequo')];
let expired = false; let challengeCollection = true; let failReceiptReadback = false; let failRefundResponse = true; let refundInstructions = 0; let returnReads = 0;
const bodies = {collection:[],receipt:[],refund:[]};
const keys = new Map();
const addHistory = (record,action,metadata) => record.history.push({action,metadata,createdAt:now,actorUserId:'admin-fixture'});
const server = http.createServer(async(req,res)=>{
  if (!req.url.startsWith('/api/')) {
    const file=path.join(process.cwd(),'dist',req.url.startsWith('/assets/')?req.url:'/index.html');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;
  }
  let raw='';for await(const part of req)raw+=part;
  const body=raw?JSON.parse(raw):undefined;res.setHeader('Content-Type','application/json');
  if(expired){res.statusCode=401;res.end('{}');return;}
  let result={};
  if(req.url==='/api/auth/me') result={id:'admin-fixture',email:'fixture@example.invalid',active:true,roles:[req.headers.authorization?.includes('nonadmin')?'CUSTOMER':'ADMIN'],provider:'EMAIL'};
  else if(req.url==='/api/auth/refresh') result={accessToken:'refreshed-admin-fixture',refreshToken:'refreshed-refresh-fixture'};
  else if(req.url.startsWith('/api/returns')) {
    assert.ok(req.headers.authorization?.startsWith('Bearer '));
    const url=new URL(req.url,'http://fixture.invalid');
    if(url.pathname==='/api/returns') {returnReads++;result=returns.filter(item=>!url.searchParams.get('status')||item.status===url.searchParams.get('status'));}
    else {
      const [id,action]=url.pathname.slice('/api/returns/'.length).split('/');const record=returns.find(item=>item.id===id);assert.ok(record);
      if(req.method==='GET') {
        returnReads++;
        if(failReceiptReadback){failReceiptReadback=false;res.statusCode=503;res.end(JSON.stringify({message:'Fixture readback temporarily unavailable'}));return;}
        result=record;
      } else {
        assert.ok(body.idempotencyKey);assert.equal(body.receivedAt,undefined);assert.equal(body.collectedAt,undefined);assert.equal(body.actorUserId,undefined);assert.equal(body.requestedAt,undefined);
        if(action==='collection') {
          bodies.collection.push(body);
          if(challengeCollection){challengeCollection=false;res.statusCode=401;res.end('{}');return;}
        }
        if(action==='physical-receipt')bodies.receipt.push(body);
        if(action==='refund')bodies.refund.push(body);
        if(keys.has(body.idempotencyKey)){assert.deepEqual(keys.get(body.idempotencyKey),body);res.end(JSON.stringify(record));return;}
        keys.set(body.idempotencyKey,body);
        if(action==='collection') {
          assert.equal(record.status,'DroppedAtRelay');assert.equal(body.metadata,'Collected fixture parcel');record.status='CollectedBySequo';record.collectedBySequoAt=now;record.collectingOperatorId='admin-fixture';addHistory(record,'SEQUO_COLLECTION',body.metadata);
        } else if(action==='physical-receipt') {
          assert.equal(record.status,'CollectedBySequo');assert.equal(body.responsibility,'Sequo');record.status='ReceivedBySequo';record.receivedBySequoAt=now;record.receivingOperatorId='admin-fixture';record.conditionAssessment=body.conditionAssessment;record.responsibility=body.responsibility;addHistory(record,'PHYSICAL_RECEIPT',body.conditionAssessment);failReceiptReadback=true;
        } else if(action==='inspection') {
          assert.equal(record.status,'ReceivedBySequo');assert.ok(body.conditionAssessment);record.inspectionDecision=body.decision;record.inspectedAt=now;record.inspectingOperatorId='admin-fixture';record.conditionAssessment=body.conditionAssessment;record.responsibility=body.responsibility;if(body.decision==='REJECTED')record.status='Rejected';addHistory(record,'CONDITION_'+body.decision,body.conditionAssessment);
        } else if(action==='refund') {
          assert.equal(record.inspectionDecision,'ACCEPTED');assert.equal(body.amountCfa,2500);assert.equal(body.reason,undefined);record.status='RefundPending';record.refundAmountCfa=body.amountCfa;record.refundInstruction={id:'refund-instruction-fixture',amountCfa:body.amountCfa,currency:'XOF',requestedAt:now,requestedByUserId:'admin-fixture',status:'REQUESTED',paymentStatus:'NOT_SUBMITTED'};refundInstructions++;addHistory(record,'REFUND_INSTRUCTION','Instruction saved; provider not submitted');
          if(failRefundResponse){failRefundResponse=false;res.statusCode=503;res.end(JSON.stringify({message:'Fixture response lost after save'}));return;}
        } else assert.fail('Unexpected return action '+action);
        result=record;
      }
    }
  }
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('http://127.0.0.1:')?request.continue():request.abort());
    await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('sequo_admin_access_token','admin-fixture');sessionStorage.setItem('sequo_admin_refresh_token','refresh-fixture');});
    const root=`http://127.0.0.1:${server.address().port}/`;
    const navigateReturns=()=>[...document.querySelectorAll('.nav-button strong')].find(node=>node.textContent.trim()==='Returns').closest('button').click();
    const waitIdle=()=>page.waitForFunction(()=>![...document.querySelectorAll('.return-operations button')].find(node=>node.textContent.trim()==='Refresh returns')?.disabled);
    const click=async(label)=>page.evaluate(label=>[...document.querySelectorAll('.return-operations button')].find(node=>node.textContent.trim()===label).click(),label);
    const open=async(id)=>{await page.evaluate(id=>[...document.querySelectorAll('.return-operations li button')].find(node=>node.textContent.startsWith(id+' ·')).click(),id);await page.waitForSelector('.return-card h4');await waitIdle();};
    const field=async(label,value)=>{
      await page.evaluate(label=>{const input=[...document.querySelectorAll('.return-operations label')].find(node=>node.textContent.startsWith(label)).querySelector('input,textarea,select');input.dataset.selectedFixture='true';input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));},label);
      const tag=await page.$eval('[data-selected-fixture]',node=>node.tagName);
      if(tag==='SELECT')await page.select('[data-selected-fixture]',value);else await page.type('[data-selected-fixture]',value);
      await page.$eval('[data-selected-fixture]',node=>delete node.dataset.selectedFixture);
    };
    const disabled=label=>page.evaluate(label=>[...document.querySelectorAll('.return-operations button')].find(node=>node.textContent.trim()===label).disabled,label);
    await page.goto(root);await page.waitForSelector('.nav-button strong');await page.evaluate(navigateReturns);await page.waitForFunction(()=>document.querySelector('.return-operations')?.textContent.includes('return-fixture'));
    await open('return-fixture');assert.equal(await disabled('Confirm physical receipt'),true);assert.equal(await disabled('Record refund instruction'),true);
    assert.ok(await page.$eval('.return-operations',node=>node.textContent.includes('Pending written clarification')||node.textContent.includes('pending written clarification')));
    await field('Collection receipt note','Collected fixture parcel');await click('Record SEQUO collection');await page.waitForFunction(()=>document.querySelector('.return-card h4')?.textContent.includes('Collected by sequo'));await waitIdle();assert.equal(bodies.collection.length,2);assert.deepEqual(bodies.collection[0],bodies.collection[1]);
    await field('Physical receipt note','Received; inspection pending');await field('Responsibility','Sequo');await click('Confirm physical receipt');await page.waitForFunction(()=>document.body.innerText.includes('The action was saved, but readback failed.'));
    assert.equal(await page.$eval('.return-operations textarea',node=>node.disabled),true);await click('Retry saved action');await page.waitForFunction(()=>document.querySelector('.return-card h4')?.textContent.includes('Received by sequo'));await waitIdle();assert.deepEqual(bodies.receipt[0],bodies.receipt[1]);assert.equal(await disabled('Record refund instruction'),true);
    await field('Condition inspection decision','ACCEPTED');await field('Condition inspection assessment','Sealed product verified at fixture inspection');await field('Inspected responsibility','Merchant');await click('Record condition decision');await page.waitForFunction(()=>[...document.querySelectorAll('.return-operations dt')].find(node=>node.textContent==='Condition decision')?.nextElementSibling.textContent.includes('Accepted'));await waitIdle();
    await open('return-legacy');assert.equal(await page.$$eval('.return-operations textarea',nodes=>nodes.every(node=>node.value==='')),true);
    await open('return-fixture');
    await field('Refund instruction amount (CFA)','2500');await click('Record refund instruction');await page.waitForFunction(()=>document.body.innerText.includes('Fixture response lost after save'));
    const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_return_pending:admin-fixture')));assert.equal(stored.body.amountCfa,2500);
    await page.reload();await page.waitForSelector('.nav-button strong');await page.evaluate(navigateReturns);await page.waitForFunction(()=>document.querySelector('.return-card h4')?.textContent.includes('Refund pending'));await waitIdle();assert.equal(refundInstructions,1);assert.equal(bodies.refund.length,1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sequo_return_pending:admin-fixture')),null);
    assert.ok(await page.$eval('.return-operations',node=>node.textContent.includes('Not submitted')));assert.equal(await disabled('Record refund instruction'),true);
    await page.screenshot({path:'/tmp/sequo-task20-admin.png',fullPage:true});
    await open('return-legacy');await field('Condition inspection decision','REJECTED');await field('Condition inspection assessment','Damaged fixture packaging');await field('Inspected responsibility','Courier');await click('Record condition decision');await page.waitForFunction(()=>document.querySelector('.return-card h4')?.textContent.includes('Rejected'));await waitIdle();assert.equal(await disabled('Record refund instruction'),true);assert.equal(returns[1].collectedBySequoAt,null);
    await field('Return queue','Requested');await page.$eval('.return-operations select',node=>node.dispatchEvent(new Event('change',{bubbles:true})));await waitIdle();assert.ok(await page.$eval('.return-operations',node=>node.textContent.includes('No returns in this queue.')));
    expired=true;await click('Refresh returns');await page.waitForFunction(()=>!document.querySelector('.return-operations'));assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('sequo_return_pending:'))),false);
    expired=false;
    for(const token of ['nonadmin-fixture',null]){
      const another=await browser.newPage();await another.setRequestInterception(true);another.on('request',request=>request.url().startsWith(root)?request.continue():request.abort());
      if(token)await another.evaluateOnNewDocument(token=>sessionStorage.setItem('sequo_admin_access_token',token),token);
      const before=returnReads;await another.goto(root);await another.waitForFunction(()=>document.body.innerText.includes('SEQUO'));
      if(token)await another.waitForFunction(()=>document.body.innerText.includes('not allowed'));
      assert.equal(await another.$('.return-operations'),null);assert.equal(returnReads,before);await another.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: authenticated queues/detail, collection auth-refresh retry, receipt readback failure/frozen retry, explicit accepted/rejected inspection including legacy receipt, cleared notes between returns, one refund instruction recovered after reload, provider-not-submitted state, unconfigured deadline, empty queue and expired/missing/non-admin fail-closed sessions. Mock HTTP only.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
