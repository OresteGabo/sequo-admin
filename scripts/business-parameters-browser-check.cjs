const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
let approved = false; let expired = false;
const labels = ['Minimum delivery price','Price per additional kilometer','Merchant commission percentages','Subscriber discount rates','Referral credits','Bargaining attempt limits','Negotiated price lock duration','Return request window','Relay custody deadlines and storage fees','Products excluded from relay or return handling'];
const parameters = () => labels.map((label,index)=>({reference:131+index,key:`fixture-${index}`,label,state:index===3&&!approved?'PENDING_APPROVAL':'CONFIGURED',
  effectiveValues:index===3?{'Plan LOCAL_FIXTURE_ONLY':approved?'APPROVED_ACTIVE; configured discount 12%; verified continuous paid tenure required.':'PENDING_APPROVAL; configured discount 12%; no applied benefit without approval.', 'Effective fixture benefit':approved?'12%':'0 CFA'}:{'Server fixture value':String(7+index)},
  source:'Named runtime service and persisted configuration; no environment or credential-bearing object is serialized.',
  changeAuthority:'SEQUO policy owner and authorized deployment operator.',changeProcedure:'Use an approved supported configuration change; refresh the authenticated inventory and verify the authoritative quote.',verification:'Compare actual server readback and local fixture boundary checks.',pendingDecision:index===3&&!approved?'Written approval required before activation.':null}));
const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/')){const file=path.join(process.cwd(),'dist',req.url.startsWith('/assets/')?req.url:'/index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;}
  res.setHeader('Content-Type','application/json');if(expired){res.statusCode=401;res.end('{}');return;}
  assert.ok(req.headers.authorization?.startsWith('Bearer '));
  let result={};
  if(req.url==='/api/auth/me')result={id:'fixture-admin',email:'fixture@example.invalid',active:true,roles:['ADMIN'],provider:'EMAIL'};
  else if(req.url==='/api/admin/web/delivery-pricing')result={active:{profile:'LOCAL_FIXTURE_ONLY',minimumDeliveryFeeCfa:490,extraKmFeeCfa:120,includedKm:6,effectiveFrom:'2026-11-08T00:00:00Z'}};
  else if(req.url==='/api/admin/web/business-parameters')result={parameters:parameters(),generatedAt:'2026-11-08T00:00:00Z',defaultCommissionRateBps:1500,commissionOverrideCount:2,relayStorageFeeAssessmentCount:4,relayExcludedProductPolicySource:'RelayParcelPolicy',returnWindowPolicySource:'CustomerReturnPolicy'};
  res.end(JSON.stringify(result));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1100});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('http://127.0.0.1:')?request.continue():request.abort());
    await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('sequo_admin_access_token','fixture-access');sessionStorage.setItem('sequo_admin_refresh_token','fixture-refresh');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.nav-button strong');
    await page.evaluate(()=>[...document.querySelectorAll('.nav-button strong')].find(node=>node.textContent==='Settings').closest('button').click());
    await page.waitForFunction(()=>document.body.innerText.includes('140. Products excluded'));
    assert.equal(await page.$$eval('.parameter-inventory h3',nodes=>nodes.filter(node=>/^13[1-9]\.|^140\./.test(node.textContent)).length),10);
    assert.ok(await page.$eval('.workspace',node=>node.textContent.includes('490 CFA')));
    await page.evaluate(()=>{[...document.querySelectorAll('.parameter-inventory')].find(node=>node.querySelector('h3')?.textContent.startsWith('134.')).dataset.fixtureScreenshot='true';});
    assert.ok(await page.$eval('[data-fixture-screenshot]',node=>node.textContent.includes('Pending approval')&&node.textContent.includes('0 CFA')));
    await (await page.$('[data-fixture-screenshot]')).screenshot({path:'/tmp/sequo-task21-admin-inventory.png'});
    approved=true;await page.evaluate(()=>[...document.querySelectorAll('.panel-heading button')].find(node=>node.textContent.includes('Refresh')).click());
    await page.waitForFunction(()=>document.body.innerText.includes('APPROVED_ACTIVE'));assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.parameter-inventory')].find(node=>node.querySelector('h3')?.textContent.startsWith('134.')).textContent.includes('12%')));
    expired=true;await page.evaluate(()=>[...document.querySelectorAll('.panel-heading button')].find(node=>node.textContent.includes('Refresh')).click());
    await page.waitForFunction(()=>!document.body.innerText.includes('APPROVED_ACTIVE'));assert.equal(await page.$('.parameter-inventory'),null);assert.deepEqual(errors,[]);
    console.log('PASS: authenticated ten-parameter Settings inventory, actual pricing fixture, pending approval distinct from configured discount, refreshed server activation and expired-session clearing. Mock HTTP only.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
