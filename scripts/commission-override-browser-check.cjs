const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
let expired=false,legacyRead=false,failReadback=false,loseResponse=false,failNextGet=false,revision=0,effective=1500,override=null,writes=0,writeCalls=0;
const history=[],claims=new Map();const now='2026-11-08T12:00:00Z';
const current=()=>({merchantId:'merchant-fixture',commissionRateBps:effective,override,defaultRateBps:1500,minRateBps:500,maxRateBps:1500,revision:`revision-${revision}`,operationId:history[0]?.id??null,history});
function apply(action,body,actor='admin-fixture'){
  const before=effective,present=Boolean(override);effective=action==='SET'?body.commissionRateBps:1500;revision++;
  override=action==='SET'?{merchantId:'merchant-fixture',commissionRateBps:effective,reason:body.reason,updatedByUserId:actor,createdAt:now,updatedAt:now}:null;
  history.unshift({id:`operation-${revision}`,action,actorUserId:actor,beforeRateBps:before,afterRateBps:effective,beforeOverridePresent:present,afterOverridePresent:action==='SET',reason:body.reason,createdAt:now,idempotencyKey:body.idempotencyKey,revision:`revision-${revision}`});
}
const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/')){const file=path.join(process.cwd(),'dist',req.url.startsWith('/assets/')?req.url:'/index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;}
  res.setHeader('Content-Type','application/json');if(expired){res.statusCode=401;res.end('{}');return;}assert.ok(req.headers.authorization?.startsWith('Bearer '));let result={};
  if(req.url==='/api/auth/me')result={id:'admin-fixture',email:'fixture@example.invalid',active:true,roles:req.headers.authorization.includes('nonadmin')?['CUSTOMER']:['ADMIN'],provider:'EMAIL'};
  else if(req.url==='/api/admin/web/commissions')result={defaultRateBps:1500,overrides:override?[override]:[]};
  else if(req.url==='/api/commissions/merchant-overrides/merchant-fixture'){
    if(req.method==='GET'){
      if(failNextGet){failNextGet=false;res.statusCode=503;res.end(JSON.stringify({message:'Fixture readback unavailable'}));return;}
      result=legacyRead?{merchantId:'merchant-fixture',commissionRateBps:effective,override}:current();
    }else{
      assert.ok(['PUT','DELETE'].includes(req.method));writeCalls++;let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);const action=req.method==='PUT'?'SET':'RESET';
      assert.equal(body.updatedByUserId,undefined);assert.ok(body.reason);assert.ok(body.idempotencyKey);const canonical=JSON.stringify({action,body});
      const previous=claims.get(body.idempotencyKey);
      if(previous){assert.equal(previous,canonical,'Retry must preserve the exact intent');}
      else{if(body.expectedRevision!==`revision-${revision}`){res.statusCode=409;res.end(JSON.stringify({message:'Commission changed; refresh before writing'}));return;}
        assert.ok(action==='RESET'||(body.commissionRateBps>=500&&body.commissionRateBps<=1500));apply(action,body);claims.set(body.idempotencyKey,canonical);writes++;
      }
      if(failReadback){failReadback=false;failNextGet=true;}
      if(loseResponse){loseResponse=false;res.statusCode=503;res.end(JSON.stringify({message:'Fixture write response lost after save'}));return;}
      if(req.method==='DELETE'){res.statusCode=204;res.end();return;}result={...override,revision:`revision-${revision}`,operationId:history[0].id};
    }
  }else if(req.url.startsWith('/api/commissions/merchant-overrides/')){res.statusCode=404;res.end('{}');return;}
  else if(req.url==='/api/merchant/sub-orders/frozen-sub')result={id:'frozen-sub',orderId:'existing-order',merchantId:'merchant-fixture',status:'HANDED_TO_COURIER',itemSubtotalCfa:4000,commissionRateBps:1500,commissionCfa:600,merchantNetCfa:3400,updatedAt:now};
  else if(req.url.startsWith('/api/settlements/ledger?'))result=[];
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1280,height:1300});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('http://127.0.0.1:')?request.continue():request.abort());
    await page.evaluateOnNewDocument(()=>sessionStorage.setItem('sequo_admin_access_token','admin-fixture'));const root=`http://127.0.0.1:${server.address().port}/`;
    const nav=async()=>{await page.waitForSelector('.nav-button strong');await page.evaluate(()=>[...document.querySelectorAll('.nav-button strong')].find(node=>node.textContent==='Commissions').closest('button').click());await page.waitForSelector('.commission-override');};
    const click=async label=>page.evaluate(label=>[...document.querySelectorAll('.commission-override button')].find(node=>node.textContent.trim()===label).click(),label);
    const idle=()=>page.waitForFunction(()=>![...document.querySelectorAll('.commission-override button')].find(node=>node.textContent.includes('Reading or saving')));
    const field=async(label,value)=>page.evaluate((label,value)=>{const node=[...document.querySelectorAll('.commission-override label')].find(node=>node.textContent.startsWith(label)).querySelector('input,textarea');node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));},label,value);
    const read=async()=>{await click('Read current commission');await idle();};
    const prepare=async(value,reason,reset=false)=>{await field('Proposed commission (%)',value);await field('Reason',reason);await click(reset?'Review reset to default':'Review override change');await page.waitForSelector('[aria-label="Confirm commission change"]');};
    await page.goto(root);await nav();await field('Merchant ID','merchant-fixture');await read();assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('Effective 15.00%')&&node.textContent.includes('No historical changes recorded')));
    await prepare('10.00','Approved fixture agreement');await click('Cancel change');assert.equal(writeCalls,0);assert.equal(writes,0);
    await prepare('12.00','Stale fixture proposal');apply('SET',{commissionRateBps:1100,reason:'Concurrent admin fixture',idempotencyKey:'external-change'},'other-admin');await click('Confirm commission change');await idle();assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('refresh before writing')));assert.equal(writes,0);assert.equal(effective,1100);
    const staleIntent=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_commission_pending:admin-fixture')));await read();assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('Effective 11.00%')));await click('Discard saved intent after review');
    await prepare('10.00','Approved fixture agreement');failReadback=true;const previousCalls=writeCalls;
    await page.evaluate(()=>{const button=[...document.querySelectorAll('.commission-override button')].find(node=>node.textContent.trim()==='Confirm commission change');button.click();button.click();});await idle();assert.equal(writeCalls,previousCalls+1);assert.equal(writes,1);assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('readback is unconfirmed')));
    const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_commission_pending:admin-fixture')));assert.equal(saved.acknowledged,true);assert.notEqual(saved.body.idempotencyKey,staleIntent.body.idempotencyKey);await click('Retry saved commission change');await idle();assert.equal(writes,1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sequo_commission_pending:admin-fixture')),null);assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('Effective 10.00%')&&node.textContent.includes('admin-fixture')));
    await page.select('.finance-ledger select','OrderItem');await page.type('.finance-ledger input','frozen-sub');await page.click('.finance-ledger form button');await page.waitForFunction(()=>document.querySelector('.finance-ledger')?.textContent.includes('15.00%'));assert.ok(await page.$eval('.finance-ledger',node=>node.textContent.includes('600 CFA')));
    await (await page.$('.commission-override')).screenshot({path:'/tmp/sequo-task27-admin-commission.png'});
    await prepare('10.00','Restore server default fixture',true);loseResponse=true;await click('Confirm commission change');await idle();assert.equal(writes,2);assert.equal(effective,1500);const resetKey=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_commission_pending:admin-fixture')).body.idempotencyKey);
    await page.reload();await nav();await idle();assert.equal(writes,2);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sequo_commission_pending:admin-fixture')),null);assert.ok(history.some(entry=>entry.action==='RESET'&&entry.idempotencyKey===resetKey));assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('Effective 15.00%')));
    legacyRead=true;await read();assert.ok(await page.$eval('.commission-override',node=>node.textContent.includes('remains read-only')));legacyRead=false;await read();
    await page.setOfflineMode(true);await read();assert.equal(await page.$eval('.commission-override',node=>node.textContent.includes('Effective 15.00%')),false);await page.setOfflineMode(false);await read();
    await prepare('9.00','Pending expired-session fixture');loseResponse=true;await click('Confirm commission change');await idle();expired=true;await click('Retry saved commission change');await page.waitForFunction(()=>!document.querySelector('.commission-override'));assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('sequo_commission_pending:'))),false);expired=false;
    for(const token of [null,'nonadmin-fixture']){const another=await browser.newPage();if(token)await another.evaluateOnNewDocument(token=>sessionStorage.setItem('sequo_admin_access_token',token),token);await another.goto(root);if(token)await another.waitForFunction(()=>document.body.innerText.includes('not allowed'));else await another.waitForSelector('input[type="email"]');assert.equal(await another.$('.commission-override'),null);await another.close();}
    assert.deepEqual(errors,[]);console.log('PASS: server policy, cancelled confirmation, stale revision409, duplicate tap, exact frozen retry after failed readback, actor audit, frozen prior15% snapshot, reset204+lost-response reload readback, metadata-missing read-only, offline clearing, expired/missing/nonadmin sessions. Local mock HTTP only.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
