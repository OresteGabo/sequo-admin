const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
let assigned = false; let reject = false; let expired = false; let posts = 0;
const mission = () => ({id:'mode-mission',deliveryCode:'MODE-1',orderId:'order-1',courierId:assigned ? 'salary-fixture' : null,
  deliveryMode:'STANDARD',destinationType:'CUSTOMER_ADDRESS',status:'CREATED',updatedAt:'2026-11-08T00:00:00Z',
  deliveryOption:{id:'CLASSIC',etaMinMinutes:120,etaMaxMinutes:240,deliveryFeeCfa:400,zoneId:'LOCAL_FIXTURE_ONLY'},
  subscriberPriority:true,assignmentWorkforceType:assigned ? 'SequoSalaried' : null});
const server = http.createServer(async (req,res) => {
  if (!req.url.startsWith('/api/')) {
    const file = path.join(process.cwd(),'dist', req.url.startsWith('/assets/') ? req.url : '/index.html');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file)); return;
  }
  res.setHeader('Content-Type','application/json');
  if (expired) {res.statusCode=401;res.end('{}');return;}
  let result = {};
  if (req.url === '/api/auth/me') result = {id:'admin-fixture',email:'fixture@example.invalid',active:true,roles:['ADMIN'],provider:'EMAIL'};
  else if (req.url === '/api/admin/web/deliveries') result = {missions:[mission()],merchantSubOrderCounts:{PACKED_READY:1}};
  else if (req.url === '/api/delivery/missions') result = [mission()];
  else if (req.url === '/api/delivery/missions/mode-mission') result = mission();
  else if (req.url.endsWith('/assign-policy')) {
    assert.equal(req.method,'POST'); assert.equal(req.headers.authorization,'Bearer fixture-access'); posts++;
    if (reject) {res.statusCode=409;result={message:'No courier capacity'};}
    else {assigned=true;result=mission();}
  }
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('http://127.0.0.1:') ? request.continue() : request.abort());
    await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('sequo_admin_access_token','fixture-access');sessionStorage.setItem('sequo_admin_refresh_token','fixture-refresh');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>[...document.querySelectorAll('.nav-button strong')].some(b=>b.textContent.trim()==='Deliveries'));
    await page.evaluate(()=>[...document.querySelectorAll('.nav-button strong')].find(b=>b.textContent.trim()==='Deliveries').closest('button').click());
    await page.waitForFunction(()=>document.body.innerText.includes('LOCAL_FIXTURE_ONLY'));
    const input = await page.$('input[maxlength="128"]'); await input.type('mode-mission');
    async function clickByText(selector,text) { await page.evaluate((selector,text)=>[...document.querySelectorAll(selector)].find(b=>b.textContent.includes(text)).click(),selector,text); }
    async function clickAssign(){
      await clickByText('button','Assign available courier');
      await page.waitForFunction(()=>document.querySelector('[aria-label="Choose service action"]')?.value==='assign-policy');
      await page.evaluate(()=>{const input=[...document.querySelectorAll('.action-form label')].find(l=>l.textContent.includes('Assignment reason')).querySelector('textarea');input.value='Local fixture dispatch review';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await clickByText('.action-form button','Review action');await page.waitForSelector('.confirm-dialog');
      await clickByText('.confirm-dialog button','Confirm action');
    }
    await clickAssign();await page.waitForFunction(()=>document.body.innerText.includes('salary-fixture') && document.body.innerText.includes('Action confirmed'));
    assert.equal(posts,1);
    reject=true;await clickAssign();await page.waitForFunction(()=>document.body.innerText.includes('No courier capacity'));
    reject=false;expired=true;await clickByText('.pending-action-tools button','Review exact retry');await clickByText('.confirm-dialog button','Confirm action');await page.waitForFunction(()=>!document.body.innerText.includes('salary-fixture'));
    assert.deepEqual(errors,[]);console.log('PASS: authenticated built admin UI renders mode/ETA/price, reviews reason and policy assignment, reports capacity rejection, preserves exact retries and clears expired sessions. Mock HTTP only.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
