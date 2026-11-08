const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
(async () => {
  const { createServer } = await import('vite');
  const vue = (await import('@vitejs/plugin-vue')).default;
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sequo-reference-browser-'));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/human-reference-v1.json'), 'utf8'));
  const { encodeReference } = await import(pathToFileURL(path.join(root, 'src/humanReference.ts')));
  const second = encodeReference('ORDER','654321');
  fs.writeFileSync(path.join(dir,'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
  fs.writeFileSync(path.join(dir,'main.js'), `import {createApp} from 'vue';import App from './Harness.vue';createApp(App).mount('#app');`);
  fs.writeFileSync(path.join(dir,'Harness.vue'), `<script setup>
import {ref} from 'vue';import Input from ${JSON.stringify(path.join(root,'src/AdminReferenceInput.vue'))};
const model=ref(''),field=ref({name:'orderId',label:'Order reference',type:'string',location:'body',required:true});
const requests=[];let nextDeferred=false,releases=[];
async function transport(path,retry,method,body){requests.push({path,method,body});if(method!=='POST')return[{id:'opaque-order',publicReference:'C12-345-6E6',status:'DELIVERED'}];const result={kind:body.kind,id:body.reference==='C12-345-6E6'?'opaque-order':'second-order',publicReference:body.reference};if(nextDeferred){nextDeferred=false;return new Promise(resolve=>releases.push(()=>resolve(result)))}return result;}
const request=ref(transport);window.fixture={requests,model,field,defer(){nextDeferred=true},release(){releases.splice(0).forEach(fn=>fn())},switchSession(){request.value=(...args)=>transport(...args)}};
</script><template><form><label>Order<Input v-model="model" :field="{...field}" :request="request"/></label><output id="canonical">{{model}}</output><button :disabled="!model">Open record</button></form></template>`);
  const server = await createServer({configFile:false,root:dir,plugins:[vue()],resolve:{alias:{vue:path.join(root,'node_modules/vue/dist/vue.esm-bundler.js')}},server:{host:'127.0.0.1',port:0,fs:{allow:[root,dir]}}});
  let browser;
  try {
    await server.listen();const address=server.httpServer.address();
    browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForSelector('.reference-input input:not([type=checkbox])');
    async function set(value){await page.$eval('.reference-input input:not([type=checkbox])',(input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))},value)}
    await set('C12-345-6E7');await new Promise(r=>setTimeout(r,400));
    assert.equal(await page.$eval('#canonical',e=>e.textContent),'');assert.equal(await page.evaluate(()=>fixture.requests.filter(r=>r.method==='POST').length),0);
    await set('c12 345 6e6');await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='opaque-order');
    assert.equal(await page.$eval('.reference-input input:not([type=checkbox])',e=>e.value),'C12-345-6E6');
    await set('C12-345-6E7');await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='');
    await set('C12-345-6E6');await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='opaque-order');
    const first=await page.evaluate(()=>fixture.requests.find(r=>r.method==='POST'));assert.deepEqual(first.body,{kind:'ORDER',reference:'C12-345-6E6',legacyId:false});
    // A slow old request cannot overwrite a later verified target.
    await page.evaluate(()=>fixture.defer());await set('C12-345-6E6');await new Promise(r=>setTimeout(r,300));await set(second);await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='second-order');await page.evaluate(()=>fixture.release());await new Promise(r=>setTimeout(r,50));assert.equal(await page.$eval('#canonical',e=>e.textContent),'second-order');
    // Both field and authenticated request context invalidate previously resolved canonical values.
    await page.evaluate(()=>fixture.field.value={...fixture.field.value,name:'returnId'});await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='');
    await page.evaluate(()=>fixture.field.value={...fixture.field.value,name:'orderId'});await set('C12-345-6E6');await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='opaque-order');
    await page.evaluate(()=>fixture.switchSession());await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='');
    // A response from the prior authenticated request context cannot restore its target.
    await page.evaluate(()=>fixture.defer());await set('C12-345-6E6');await new Promise(r=>setTimeout(r,300));await page.evaluate(()=>fixture.switchSession());await page.evaluate(()=>fixture.release());await new Promise(r=>setTimeout(r,50));assert.equal(await page.$eval('#canonical',e=>e.textContent),'');
    // Legacy mode is deliberate, preserves arbitrary supported IDs, and invokes no reference resolver.
    const before=await page.evaluate(()=>fixture.requests.filter(r=>r.method==='POST').length);await page.click('input[type=checkbox]');await set('legacy:order-42');await page.waitForFunction(()=>document.querySelector('#canonical').textContent==='legacy:order-42');assert.equal(await page.evaluate(()=>fixture.requests.filter(r=>r.method==='POST').length),before);
    assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/sequo-admin-human-reference-input.png'});
    console.log(JSON.stringify({result:'PASS',cases:9,vectors:fixture.vectors.length,screenshot:'/tmp/sequo-admin-human-reference-input.png'}));
  } finally {if(browser)await browser.close();server.httpServer.closeAllConnections();await server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
