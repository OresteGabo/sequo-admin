const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const now='2026-11-08T12:00:00.123456Z';let site=null,slots=[],history=[],next=0,writeCalls=0,uniqueWrites=0,failReadback=false,loseDeposit=false,expired=false;
const claims=new Map(),calls=[];const mission={id:'mission-A',orderId:'order-A',relayPointId:'site-A',status:'PICKED_UP_FROM_SELLER',destinationType:'RELAY_POINT',pickupAt:now,courierId:'courier-A',updatedAt:now};
const snapshot=()=>({site,slots,history});const stamp=()=>new Date(Date.parse(now)+(++next)*1000).toISOString();
async function reply(request){
 const u=new URL(request.url()),p=u.pathname;const method=request.method(),body=request.postData()?JSON.parse(request.postData()):null;calls.push({p,method,body});
 let result={};let status=200;
 if(expired)return request.respond({status:401,contentType:'application/json',body:'{}'});
 if(p==='/api/auth/me')result={id:'admin-fixture',email:'admin@fixture.invalid',provider:'EMAIL',status:'ACTIVE',active:true,roles:['SUPER_ADMIN']};
 else if(p==='/api/admin/web/relay-sites'&&method==='GET')result=site?[site]:[];
 else if(p==='/api/admin/web/relay-sites/site-A/setup'){
  if(failReadback){failReadback=false;status=503;result={message:'Fixture readback unavailable'};}else result=snapshot();
 }else if(p==='/api/delivery/missions/mission-A')result=mission;
 else if(p.startsWith('/api/admin/web/relay-sites')&&method!=='GET'){
  writeCalls++;assert.ok(body.reason);assert.ok(body.idempotencyKey);assert.equal(body.actorUserId,undefined);
  const canonical=JSON.stringify({p,method,body});let saved=claims.get(body.idempotencyKey);
  if(saved)assert.equal(saved.canonical,canonical,'Uncertain retry payload must stay frozen');
  else{
   uniqueWrites++;let action,after;
   if(p==='/api/admin/web/relay-sites'){
    action='CREATE_SITE';site={id:'site-A',name:body.name,status:'ACTIVE',operatorUserId:null,latitude:body.latitude,longitude:body.longitude,city:body.city,neighborhood:body.neighborhood,landmark:body.landmark,updatedAt:stamp()};after={name:site.name};
   }else if(p.endsWith('/slots')){
    action='CREATE_SLOT';assert.equal(body.expectedUpdatedAt,site.updatedAt);slots.push({id:'slot-A',relayPointId:'site-A',lockerCode:body.lockerCode,status:'AVAILABLE',updatedAt:stamp()});site.updatedAt=slots[0].updatedAt;site.operatorUserId='operator-A';/* Companion scoped operator setup is already complete in this browser fixture. */after={lockerId:'slot-A',lockerCode:body.lockerCode,status:'AVAILABLE'};
   }else if(p.endsWith('/deposits')){
    action='SEQUO_DEPOSIT';assert.equal(body.physicalReceiptConfirmed,true);assert.equal(body.expectedMissionUpdatedAt,mission.updatedAt);assert.equal(body.expectedSlotUpdatedAt,slots[0].updatedAt);slots[0].status='OCCUPIED';slots[0].updatedAt=stamp();mission.status='DEPOSITED_AT_RELAY';mission.updatedAt=slots[0].updatedAt;after={missionId:'mission-A',lockerId:'slot-A',parcelId:'parcel-A'};
   }else throw Error('Unexpected mutation '+p);
   const operation={id:`operation-${uniqueWrites}`,relayPointId:'site-A',action,actorUserId:'admin-fixture',reason:body.reason,idempotencyKey:body.idempotencyKey,before:null,after,createdAt:stamp()};history.unshift(operation);saved={canonical,operation};claims.set(body.idempotencyKey,saved);
  }
  result={record:snapshot(),operation:saved.operation,parcelId:saved.operation.after.parcelId??null};
  if(p.endsWith('/deposits')&&loseDeposit){loseDeposit=false;status=503;result={message:'Fixture receipt response lost after save'};}
 }else if(p.includes('/sites')||p.endsWith('/relay')||p.endsWith('/parcels'))result=[];
 await request.respond({status,contentType:'application/json',body:JSON.stringify(result)});
}
const server=http.createServer((req,res)=>{const file=path.join(process.cwd(),'dist',req.url.startsWith('/assets/')?req.url:'/index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:1800});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let confirm=false;page.on('dialog',async d=>confirm?d.accept():d.dismiss());
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).pathname.startsWith('/api/')?void reply(r).catch(e=>{console.error(e);r.abort().catch(()=>{});}):r.url().startsWith(`http://127.0.0.1:${server.address().port}/`)?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>sessionStorage.setItem('sequo_admin_access_token','admin-fixture'));
  const root=`http://127.0.0.1:${server.address().port}/`;
  const nav=async()=>{await page.waitForSelector('.nav-button strong');await page.evaluate(()=>[...document.querySelectorAll('.nav-button strong')].find(n=>n.textContent==='Relay points').closest('button').click());await page.waitForSelector('.relay-administration');await idle();};
  const click=async text=>page.evaluate(text=>[...document.querySelectorAll('.relay-administration button')].find(b=>b.textContent.trim()===text).click(),text);
  const idle=()=>page.waitForFunction(()=>![...document.querySelectorAll('.relay-administration button')].find(b=>b.textContent==='Refresh server state')?.disabled);
  const field=async(label,value)=>page.evaluate((label,value)=>{const n=[...document.querySelectorAll('.relay-administration label')].find(n=>n.textContent.trim().startsWith(label)).querySelector('input,textarea');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},label,value);
  await page.goto(root);await nav();await field('Name','Synthetic verified relay');await field('Latitude','6.18');await field('Longitude','1.22');await field('Reason for the next action','Verified location with partner');
  await click('Review new site');await idle();assert.equal(writeCalls,0,'Cancelled confirmation must not write');
  confirm=true;failReadback=true;await click('Review new site');await idle();assert.equal(uniqueWrites,1);assert.ok(await page.$('.relay-administration .pending'));const original=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_relay_admin_pending:admin-fixture')));
  await click('Retry saved action unchanged');await idle();assert.equal(uniqueWrites,1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sequo_relay_admin_pending:admin-fixture')),null);assert.equal(claims.get(original.body.idempotencyKey).operation.action,'CREATE_SITE');
  await field('Reason for the next action','Physical shelf verified and labelled');await field('New logical slot code','A1');await click('Review new logical slot');await idle();assert.equal(uniqueWrites,2);assert.ok(await page.$eval('.relay-administration',n=>n.textContent.includes('A1 · AVAILABLE')));
  await field('Mission ID','mission-A');await click('Read mission from server');await idle();await field('Reason for the next action','Package physically received at this relay');
  assert.equal(await page.$eval('.relay-administration',n=>[...n.querySelectorAll('button')].find(b=>b.textContent.includes('Review SEQUO receipt')).disabled),true);
  await page.evaluate(()=>{const label=[...document.querySelectorAll('.relay-administration label')].find(n=>n.textContent.startsWith('Free logical slot'));const select=label.querySelector('select');select.value='slot-A';select.dispatchEvent(new Event('change',{bubbles:true}));const checkbox=[...document.querySelectorAll('.relay-administration input[type=checkbox]')][0];checkbox.click();});
  confirm=false;await click('Review SEQUO receipt and deposit');await idle();assert.equal(uniqueWrites,2);
  confirm=true;loseDeposit=true;await click('Review SEQUO receipt and deposit');await idle();assert.equal(uniqueWrites,3);assert.ok(await page.$('.relay-administration .pending'));const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sequo_relay_admin_pending:admin-fixture')));
  await page.reload();await nav();assert.ok(await page.$('.relay-administration .pending'));await click('Retry saved action unchanged');await idle();assert.equal(uniqueWrites,3);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sequo_relay_admin_pending:admin-fixture')),null);assert.equal(claims.get(saved.body.idempotencyKey).operation.action,'SEQUO_DEPOSIT');assert.ok(await page.$eval('.relay-administration',n=>n.textContent.includes('OCCUPIED')&&n.textContent.includes('admin-fixture')));
  await (await page.$('.relay-administration')).screenshot({path:'/tmp/sequo-admin-relay-administration.png'});
  expired=true;await click('Refresh server state');await page.waitForFunction(()=>!document.querySelector('.relay-administration'));assert.deepEqual(errors,[]);
  console.log('PASS: site/slot forms, required receipt proof, cancelled confirmations, immutable retry after failed readback, normal mission preview, lost deposit response and reload recovery, actor history, occupied state and expired-session clearing. Mock HTTP only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
