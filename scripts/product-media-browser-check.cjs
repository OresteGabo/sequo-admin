/* LOCAL MOCK HTTP ONLY. Synthetic canvas frames test UI capture; no real camera, account or provider. */
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http'); const assert = require('node:assert/strict'); const crypto = require('node:crypto');
const puppeteer = require('puppeteer-core');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sequo-media-browser-'));
const requests = []; const errors = []; let failCameraOnce = true; let failRead = false; let tick = 0;
const states = new Map(['camera-product', 'generic-product'].map((id, index) => [id, { product: { id, merchantId:null, name:index ? 'LOCAL MOCK standard product' : 'LOCAL MOCK prepared product', kind:index ? 'GenericSealedItem' : 'SellerSpecific', status:'INACTIVE', photoRequired:!index, cameraVerified:false, imageUrl:null, capturedAtLabel:null, updatedAt:'2026-11-08T10:00:00.000000Z' }, approvedGenericImageUrl:null, previewDataUrl:null, history:[] }]));
const operations = new Map();
function fields(raw, boundary) {
  const result = {}; let jpeg;
  for (const part of raw.toString('latin1').split('--' + boundary)) {
    const name = /name="([^"]+)"/.exec(part)?.[1]; if (!name) continue;
    const start = part.indexOf('\r\n\r\n'); const data = part.slice(start + 4).replace(/\r\n$/, '');
    if (name === 'file') { jpeg = Buffer.from(data, 'latin1'); result.fileHash=crypto.createHash('sha256').update(jpeg).digest('hex'); assert.equal(jpeg[0],255); assert.equal(jpeg[1],216); }
    else result[name] = data;
  }
  return { result, jpeg };
}
const api = http.createServer(async(req,res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*'); res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
  const url = new URL(req.url,'http://fixture'); const match=/^\/api\/admin\/web\/catalog\/products\/([^/]+)\/media(?:\/(.*))?$/.exec(url.pathname); const current=match && states.get(match[1]);
  if(!current) { res.writeHead(404).end('{}'); return; }
  if(req.method==='GET') { requests.push({method:'GET',id:match[1]}); if(failRead) { res.writeHead(503).end('{"message":"LOCAL MOCK read unavailable"}'); return; } res.end(JSON.stringify(current)); return; }
  const chunks=[]; for await(const chunk of req) chunks.push(chunk); const raw=Buffer.concat(chunks); const route=match[2]; const mime=req.headers['content-type'] || ''; let body;
  if(route==='photos/camera' || route==='photos/generic') {
    assert.ok(mime.startsWith('multipart/form-data; boundary=')); const parsed=fields(raw,mime.split('boundary=')[1]);body=parsed.result;current.previewDataUrl='data:image/jpeg;base64,'+parsed.jpeg.toString('base64');
    if(route==='photos/camera') { assert.ok(body.capturedAt); assert.ok(body.deviceId); assert.equal(current.product.kind,'SellerSpecific'); }
    else { assert.equal(body.genericApproved,'true'); assert.equal(body.capturedAt,undefined); assert.equal(current.product.kind,'GenericSealedItem'); }
  } else { assert.equal(mime,'application/json'); body=JSON.parse(raw.toString()); }
  assert.ok(body.reason); assert.ok(body.expectedUpdatedAt); assert.ok(body.idempotencyKey);
  requests.push({method:'POST',route,id:match[1],mime,body});
  const known=operations.get(body.idempotencyKey);
  if(known) assert.deepEqual(body,known,'Retry must preserve semantic fields and actual image bytes');
  else {
    assert.equal(body.expectedUpdatedAt,current.product.updatedAt); operations.set(body.idempotencyKey,body);
    current.product.updatedAt=`2026-11-08T10:00:${String(++tick).padStart(2,'0')}.000000Z`;
    if(route==='publication') current.product.status=body.status;
    else { current.product.imageUrl=`/api/catalog/products/${match[1]}/image`; current.product.cameraVerified=route==='photos/camera'; current.product.capturedAtLabel=route==='photos/camera' ? body.capturedAt : 'SEQUO-approved generic image'; }
    current.history.unshift({id:'event-'+tick,action:route==='publication'?'PUBLICATION':route==='photos/camera'?'CAMERA_IMAGE':'GENERIC_UPLOAD',actorUserId:'local-mock-admin',reason:body.reason,createdAt:current.product.updatedAt});
  }
  if(route==='photos/camera' && failCameraOnce) { failCameraOnce=false; res.writeHead(503).end('{"message":"LOCAL MOCK lost acknowledgement after persistence"}'); return; }
  res.end(JSON.stringify(current));
});
(async()=>{
  let vite, browser;
  try {
    await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve)); const apiOrigin=`http://127.0.0.1:${api.address().port}`;
    const {createServer}=await import('vite'); const {default:vue}=await import('@vitejs/plugin-vue');
    const harness={name:'media-harness',resolveId(id){if(id==='virtual:media-harness')return '\0media-harness'},load(id){if(id==='\0media-harness')return `import {createApp,h,ref} from 'vue';import Panel from '/src/AdminProductMediaPanel.vue';const product=ref('camera-product');window.swapProduct=id=>product.value=id;async function request(path,retry=true,method='GET',body){const response=await fetch(${JSON.stringify(apiOrigin)}+path,{method,headers:{Authorization:'Bearer LOCAL_MOCK_ONLY',...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw new Error(value.message||'LOCAL MOCK refused');return value}createApp({render:()=>h(Panel,{actorId:'local-mock-admin',request,initialProductId:product.value})}).mount('#app');`},configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end('<html><head><style>body{font-family:system-ui,sans-serif;color:#1a3d2b}button,input,textarea{font-family:inherit}</style></head><body><div id="app"></div><script type="module" src="/@id/__x00__media-harness"></script></body></html>')})}};
    vite=await createServer({root:process.cwd(),configFile:false,envDir:false,cacheDir:path.join(workspace,'vite'),plugins:[vue(),harness],server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/.local-workspace/**']}}}); await vite.listen(); const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']}); const page=await browser.newPage();page.setDefaultTimeout(15000);await page.setViewport({width:1100,height:1100});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith(apiOrigin)||r.url().startsWith('blob:')||r.url().startsWith('data:')?r.continue():r.abort());
    await page.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new DOMException('LOCAL MOCK denied','NotAllowedError')}}})});
    await page.goto(origin);await page.waitForSelector('.media-load button');
    async function click(text){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(x=>x.textContent.trim()===text&&!x.disabled),{},text);await page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);if(!b||b.disabled)throw new Error('Button unavailable: '+text);b.click()},text)}
    async function contains(text){await page.waitForFunction(text=>document.body.innerText.includes(text),{},text)}
    await click('Read product');await contains('LOCAL MOCK prepared product');await click('Start live camera');await contains('The camera could not start');assert.equal(requests.filter(x=>x.method==='POST').length,0);
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#24623e';g.fillRect(0,0,640,480);const s=c.captureStream(10);window.mockCameraTrack=s.getVideoTracks()[0];return s}});
    await click('Start live camera');await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);await click('Capture photograph');await page.type('textarea','LOCAL MOCK operator camera review');await click('Upload captured photo');assert.equal(await page.evaluate(()=>window.mockCameraTrack.readyState),'ended');await contains('LOCAL MOCK lost acknowledgement after persistence');assert.equal(await page.$('h4'),null);
    await click('Retry identical action');await contains('Server state read back after retry');assert.equal(states.get('camera-product').history.length,1);assert.equal(requests.filter(x=>x.route==='photos/camera').length,2);
    await click('Publish product');await page.waitForFunction(()=>document.querySelector('.media-state p')?.textContent.startsWith('ACTIVE · SellerSpecific'));assert.equal(states.get('camera-product').product.status,'ACTIVE');
    await page.evaluate(()=>window.swapProduct('generic-product'));await click('Read product');await contains('LOCAL MOCK standard product');
    const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;c.getContext('2d').fillRect(0,0,80,80);return c.toDataURL('image/jpeg').split(',')[1]});const file=path.join(workspace,'standard.jpg');fs.writeFileSync(file,Buffer.from(jpeg,'base64'));
    await (await page.$('input[type=file]')).uploadFile(file);await page.type('textarea','LOCAL MOCK SEQUO generic approval');assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Approve and upload')).disabled),true);await page.click('input[type=checkbox]');await click('Approve and upload generic image');await contains('Server state read back.');assert.equal(states.get('generic-product').product.cameraVerified,false);assert.equal(states.get('generic-product').history[0].action,'GENERIC_UPLOAD');assert.ok(await page.$('.media-preview'));
    await click('Publish product');await page.waitForFunction(()=>document.querySelector('.media-state p')?.textContent.startsWith('ACTIVE · GenericSealedItem'));await page.screenshot({path:'/tmp/sequo-admin-product-media.png',fullPage:true});
    failRead=true;await click('Read product');await contains('LOCAL MOCK read unavailable');assert.equal(await page.$('h4'),null);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',scope:'LOCAL MOCK HTTP, synthetic canvas frames only',checks:['camera-denied-no-write','actual-video-canvas-capture','multipart-JPEG-fields','lost-ack-identical-file-retry','server-readback','publication','explicit-generic-file-approval','generic-no-camera-claim','failed-read-clears-claims'],posts:requests.filter(x=>x.method==='POST').length,screenshot:'/tmp/sequo-admin-product-media.png'}));
  } finally {if(browser)await browser.close();if(vite)await vite.close();await new Promise(resolve=>api.close(resolve));fs.rmSync(workspace,{recursive:true,force:true})}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1});
