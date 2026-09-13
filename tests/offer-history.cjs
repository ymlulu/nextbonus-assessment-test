const fs=require('fs'), path=require('path'), http=require('http'), assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'), out=path.resolve(process.env.QA_OUTPUT || 'work/chart-qa');
fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.join(root,'data/offer-history.json')));
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,b)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=process.env.QA_URL || `http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:960}}), errors=[], checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.goto(url);
 async function report(card){
  await page.locator(`[data-card="${card}"]`).click();await page.locator('#clearBtn').click();
  await page.locator('button[type=submit]').click();await page.locator('.oh-stage svg').waitFor();
 }
 for(const [card,id] of Object.entries(await page.evaluate(()=>Object.fromEntries(Object.entries(NB_CONFIG.cards).map(([k,c])=>[k,c.timing.timingId]))))){
  await report(card);
  assert.equal(await page.locator('.offer-history-chart').count(),1);
  const nodes=await page.locator('.oh-node').evaluateAll(els=>els.map(e=>({current:e.dataset.current,t:e.getAttribute('transform')})));
  const pos=t=>t.match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
  const cur=nodes.find(e=>e.current==='true');assert(cur);
  assert(nodes.filter(e=>e.current==='false').every(e=>pos(e.t)[0]<pos(cur.t)[0]));
  if(['OT-CHASE-010','OT-CAPITALONE-013','OT-CITI-015'].includes(id))assert(nodes.some(e=>pos(e.t)[1]<pos(cur.t)[1]));
  if(data[id].current.offer_mechanism==='AS_HIGH_AS'){
   assert((await page.locator('.oh-current-label').innerText()).includes('最高可达'));
   assert((await page.locator('.report-text').allTextContents()).some(s=>s.includes('实际申请时你看到的奖励可能低于最高值')));
  }
  if(id==='OT-BILTCOLUMN-011')assert((await page.locator('.oh-current-label').innerText()).includes('$300 Bilt Cash'));
  const first=page.locator('.oh-node').first();await first.hover();
  assert((await page.locator('.oh-details').innerText()).length>0);
  await first.focus();await page.keyboard.press('Enter');
  checks.push({test:card,pass:true,nodes:nodes.length});
  if(['chase_sapphire_preferred','amex_gold','capital_one_venture_x'].includes(card)){
   await page.locator('.report-section').filter({has:page.locator('#offerHistoryChart')}).screenshot({path:path.join(out,card+'.png')});
  }
 }
 await report('chase_sapphire_preferred');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('nb_last_chase_sapphire_preferred')));
 await page.evaluate(()=>{NBEngine.evaluate=()=>{throw Error('Reassessment during navigation')}});
 await page.locator('#offerBtn').click();assert.equal(await page.locator('.offer-history-chart').count(),0);
 await page.locator('#fullBtn').click();await page.locator('.oh-stage svg').waitFor();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nb_last_chase_sapphire_preferred'))),before);
 checks.push({test:'Same assessment navigation; no chart in Offer Detail',pass:true});
 for(const width of [375,390]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.oh-node').last().click();
  assert((await page.locator('.oh-details').innerText()).includes('当前'));
  await page.locator('.report-section').filter({has:page.locator('#offerHistoryChart')}).screenshot({path:path.join(out,'mobile-'+width+'.png')});
  checks.push({test:`Mobile ${width}, tap`,pass:true});
 }
 // Synthetic fixtures never enter the exported source database.
 for(const kind of ['zero','one','unit','month','quarter','year','invalid']){
  const result=await page.evaluate(({kind,product})=>{
   const p=structuredClone(product);p.history=p.history.filter(e=>e.display_eligible).slice(0,1);
   if(kind==='zero')p.history=[];
   if(kind==='unit')p.history[0].comparison_unit='OTHER';
   if(kind==='month'){p.history[0].date_label='2025-05';p.history[0].date='2025-05-01';p.history[0].date_precision='MONTH'}
   if(kind==='quarter'){p.history[0].date_label='2025 Q2';p.history[0].date='2025-04-01';p.history[0].date_precision='QUARTER'}
   if(kind==='year'){p.history[0].date_label='2025';p.history[0].date='2025-01-01';p.history[0].date_precision='YEAR'}
   if(kind==='invalid')p.current.comparable_value=null;
   const host=document.getElementById('offerHistoryChart');host._historyObserver?.disconnect();
   OfferHistoryChart.render(host,p,'2026-09-13');
   host.querySelector('.oh-node')?.dispatchEvent(new Event('click'));
   return {nodes:host.querySelectorAll('.oh-node').length,text:host.textContent,details:host.querySelector('.oh-details')?.textContent};
  },{kind,product:data['OT-CHASE-010']});
  if(['zero','unit'].includes(kind)){assert.equal(result.nodes,0);assert(result.text.includes('历史奖励数据还比较少'))}
  else if(kind==='invalid')assert.equal(result.nodes,0);
  else {assert.equal(result.nodes,2);if(kind==='month')assert(result.details.includes('2025-05')&&!result.details.includes('2025-05-01'))}
  checks.push({test:`Fixture ${kind}`,pass:true});
 }
 const failure=await browser.newPage();await failure.route('**/data/offer-history.json',r=>r.abort());
 await failure.goto(url);await failure.locator('button[type=submit]').click();await failure.locator('.report').waitFor();
 assert((await failure.locator('.report-text').allTextContents()).some(s=>s.includes('75,000 UR')));
 await failure.reload();assert(await failure.locator('#form').isVisible());await failure.close();
 checks.push({test:'JSON failure preserves report; refresh',pass:true});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,errors,checks},null,2));
 console.log(JSON.stringify({url,errors,checks},null,2));
 } finally {await browser.close();server.close()}
})();
