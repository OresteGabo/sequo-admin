const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const puppeteer=require('puppeteer-core');
let expired=false;
const entry=(sourceType,sourceId,account,amountCfa)=>({id:`${sourceId}:${account}`,account,direction:account==='SequoDeliveryShortfallExpense'?'Debit':'Credit',amountCfa,merchantId:sourceType==='OrderItem'?'merchant-fixture':null,courierId:sourceType==='DeliveryMission'?'courier-fixture':null,relayPointId:null,sourceType,sourceId,description:'Persisted fixture entry; provider transfer unverified',createdAt:'2026-11-08T12:00:00Z',workforceType:sourceType==='DeliveryMission'?'Freelancer':null});
const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/')){const file=path.join(process.cwd(),'dist',req.url.startsWith('/assets/')?req.url:'/index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;}
  res.setHeader('Content-Type','application/json');if(expired){res.statusCode=401;res.end('{}');return;}assert.ok(req.headers.authorization?.startsWith('Bearer '));let result={};
  if(req.url==='/api/auth/me')result={id:'admin-fixture',email:'fixture@example.invalid',active:true,roles:['ADMIN'],provider:'EMAIL'};
  else if(req.url==='/api/admin/web/payments')result={merchantPayouts:[{id:'payout-fixture',merchantId:'merchant-fixture',orderId:'order-fixture',sourceOrderItemId:'sub-fixture',merchantNetCfa:3400,commissionCfa:600,platformMarginCfa:0,status:'HeldReturnWindow',activeReturnHold:true,activeDisputeHold:false}],webhookEvents:[]};
  else if(req.url==='/api/admin/web/commissions')result={defaultRateBps:1500,overrides:[{merchantId:'merchant-fixture',commissionRateBps:1000,reason:'Later approved override fixture',updatedByUserId:'operator-fixture',updatedAt:'2026-11-08T13:00:00Z'}]};
  else if(req.url.startsWith('/api/merchant/sub-orders/')){
    const id=decodeURIComponent(req.url.split('/').at(-1));if(id!=='sub-fixture'){res.statusCode=404;res.end('{}');return;}
    result={id,orderId:'order-fixture',merchantId:'merchant-fixture',status:'HANDED_TO_COURIER',itemSubtotalCfa:4000,commissionRateBps:1500,commissionCfa:600,merchantNetCfa:3400,updatedAt:'2026-11-08T12:00:00Z'};
  }else if(req.url.startsWith('/api/settlements/ledger?')){
    const url=new URL(req.url,'http://fixture.invalid'),kind=url.searchParams.get('sourceType'),id=url.searchParams.get('sourceId');
    if(id==='mission-failed'){res.statusCode=503;res.end('{}');return;}
    if(id==='mission-empty')result=[];
    else if(kind==='OrderItem')result=[entry(kind,id,'MerchantPayable',3400),entry(kind,id,'SequoCommissionRevenue',600)];
    else result=[entry(kind,id,'CourierPayable',400),entry(kind,id,'SequoDeliveryShortfallExpense',80)];
  }
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1280,height:1100});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('http://127.0.0.1:')?request.continue():request.abort());
    await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('sequo_admin_access_token','fixture-access');sessionStorage.setItem('sequo_admin_refresh_token','fixture-refresh');});
    const root=`http://127.0.0.1:${server.address().port}/`;
    const navigate=async(label)=>{await page.waitForSelector('.nav-button strong');await page.evaluate(label=>[...document.querySelectorAll('.nav-button strong')].find(node=>node.textContent===label).closest('button').click(),label);await page.waitForSelector('.finance-ledger');};
    const lookup=async(kind,id)=>{await page.select('.finance-ledger select',kind);await page.$eval('.finance-ledger input',node=>{node.value='';node.dispatchEvent(new Event('input',{bubbles:true}));});await page.type('.finance-ledger input',id);await page.click('.finance-ledger form button');await page.waitForFunction(()=>!document.querySelector('.finance-ledger form button')?.disabled);};
    await page.goto(root);await navigate('Payments');await page.waitForFunction(()=>document.body.innerText.includes('Commission 600 CFA'));await lookup('OrderItem','sub-fixture');
    assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('15.00%')&&node.textContent.includes('3,400 CFA')));
    await navigate('Commissions');await page.waitForFunction(()=>document.body.innerText.includes('10.00%'));assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('15.00%')));
    await lookup('DeliveryMission','mission-fixture');assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('Courier payable · Credit · 400 CFA')&&node.textContent.includes('Sequo delivery shortfall expense · Debit · 80 CFA')));
    await (await page.$('.finance-ledger')).screenshot({path:'/tmp/sequo-task22-admin-finance.png'});
    await lookup('OrderItem','legacy-line');assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('snapshot is unavailable')&&node.textContent.includes('Merchant payable')));assert.equal(await page.$eval('.finance-ledger',node=>node.textContent.includes('15.00%')),false);
    await lookup('DeliveryMission','mission-failed');assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('Ledger unavailable; no balance is inferred.')));assert.equal(await page.$eval('.finance-ledger',node=>node.textContent.includes('Merchant payable')),false);
    await lookup('DeliveryMission','mission-empty');assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('No ledger entries recorded for this source.')));
    await page.reload();await navigate('Payments');await lookup('OrderItem','sub-fixture');assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('15.00%')));
    expired=true;await lookup('DeliveryMission','mission-fixture');await page.waitForFunction(()=>!document.querySelector('.finance-ledger'));assert.deepEqual(errors,[]);
    console.log('PASS: authenticated persisted finance reads, accrual net/commission/margin, frozen15% vs later10% override, distinct400 courier payable/80 SEQUO expense, legacy ledger without snapshot, failed vs empty reads, reload readback and expired-session clearing. Mock HTTP only.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
