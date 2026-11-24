const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dynamic-questionnaire.html'),'utf8');
const client=fs.readFileSync(path.join(root,'assets/dynamic-questionnaire-demo.js'),'utf8');
for(const id of ['issuer','customer-type','card-select','generate','reset','retry',
  'offer-variant','summary','questions','assessment-result','version'])
 assert.match(html,new RegExp('id="'+id+'"'),'required control '+id);
assert.doesNotMatch(html,/id="card-query"|id="candidate"|id="confirm"/,
  'no competing free-text/candidate form');
assert.doesNotMatch(client,/lastInput|confirmedId|card-query/,
  'all questionnaire routes must use precise product IDs');
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]);
assert.ok(scripts.includes('assets/dynamic-questionnaire-demo.js'));
for(const p of scripts)assert.ok(fs.existsSync(path.join(root,p)),'script exists '+p);
class Element{
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.listeners={};this.value='';
  this.textContent='';this.disabled=false;this.hidden=false;
  this.options=[];
 }
 replaceChildren(...args){
  this.children=[...args];this.options=this.children.filter(x=>x.tag==='option');
  if(this.tag==='select')this.value=this.options[0]?.value||'';
 }
 append(...args){
  for(const node of args){
   this.children.push(node);
   if(this.tag==='select'&&node.tag==='option')this.options.push(node);
  }
 }
 addEventListener(event,handler){
  (this.listeners[event]||(this.listeners[event]=[])).push(handler);
 }
 fire(event){for(const fn of this.listeners[event]||[])fn({target:this});}
 setAttribute(){} getAttribute(){return null;}
}
const elements=new Map();
function get(id){
 if(!elements.has(id))elements.set(id,new Element(id==='issuer'||id==='customer-type'||
   id==='card-select'||id==='offer-variant'?'select':'div'));
 return elements.get(id);
}
const requestLog=[];
let failFetch=false;
const context={
 console,Promise,URL,
 window:null,
 document:{
  getElementById:get,
  createElement(tag){return new Element(tag);},
  createTextNode(value){const n=new Element('text');n.textContent=value;return n;}
 },
 fetch:async url=>{
  requestLog.push(url);
  if(failFetch)throw Error('simulated CDN failure');
  const file=path.join(root,url);
  if(!fs.existsSync(file))return {ok:false,status:404,json:async()=>null};
  return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
 }
};
context.window=context;
vm.createContext(context);
for(const src of scripts)vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),context,
 {filename:src,timeout:3000});
async function settle(){for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
 await settle();
 assert.equal(get('retry').hidden,true,'successful startup must hide retry');
 assert.equal(get('issuer').disabled,false,'bank selector initialized');
 assert.equal(get('issuer').value,'AMEX','AMEX selected only as bank');
 assert.equal(get('customer-type').value,'PERSONAL','personal selected, not card');
 assert.equal(get('card-select').value,'','card must never be auto-selected');
 assert.equal(get('generate').disabled,true,'no stale questionnaire on boot');
 assert.match(get('summary').textContent,/请选择信用卡/);
 assert.ok(get('card-select').options.length>=20,'many AMEX personal cards available');
 const bevy=get('card-select').options.find(x=>/Marriott.*Bevy/i.test(x.textContent));
 assert.ok(bevy,'formal Amex Marriott Bevy shown in selector');
 get('card-select').value=bevy.value;
 get('card-select').fire('change');
 assert.equal(get('generate').disabled,false);
 assert.match(get('summary').textContent,/Marriott/i);
 assert.ok(get('questions').children.length>0,'questions render after exact card selection');
 assert.ok(get('assessment-result').children.length>0,'evaluation renders for Amex');
 assert.equal(get('offer-variant').value,'STANDARD');
 assert.equal(get('amex-offer-settings').hidden,false);
 // Answer all four A1-A4 baseline questions with real selector events.
 // They must remain editable and visible, not disappear after becoming known.
 const walk=n=>[n,...(n.children||[]).flatMap(walk)];
 function optionSelector(value){
   return walk(get('questions')).find(n=>n.tag==='select'&&
     n.options.some(o=>o.value===value));
 }
 for(const value of ['Y1_2','SCORE_700_739','N0']){
   const select=optionSelector(value);
   assert.ok(select,'answer option rendered '+value);
   select.value=value;select.fire('change');
 }
 // A3 and A4 both offer N0; after A3 is filled choose the next unanswered N0.
 const a4=walk(get('questions')).filter(n=>n.tag==='select'&&
   n.options.some(o=>o.value==='N0')&&n.value==='')[0];
 assert.ok(a4,'fourth base question remains present');
 a4.value='N0';a4.fire('change');
 const questionCards=walk(get('questions')).filter(n=>n.tag==='section'&&
   n.className==='question');
 assert.ok(questionCards.length>=4,'all four baseline questions persist after answering');
 const redNotes=walk(get('questions')).filter(n=>n.className==='rule-delta');
 assert.ok(redNotes.some(n=>/基础档位：资料不足 → 一般/.test(n.textContent)),
   'selected baseline answer displays actual rule change in red');
 const answeredSelect=optionSelector('Y1_2');
 assert.equal(answeredSelect.value,'Y1_2','first answer remains visible/editable');
 assert.ok(redNotes.every(n=>!n.textContent.includes('保证获批')),
   'no fabricated approval guarantees in inline feedback');
 // The AMEX same-card 90-day fact is a structured choice, not free text.
 const appAnswered=optionSelector('NO');
 assert.ok(appAnswered,'Yes/No options rendered for structured application activity');
 appAnswered.value='NO';appAnswered.fire('change');
 assert.ok(walk(get('questions')).some(n=>n.tag==='select'&&n.value==='NO'),
   'completed activity question must still show its chosen option');
 get('offer-variant').value='NLL';
 get('offer-variant').fire('change');
 assert.match(get('identity-note').textContent,/NLL/);
 get('customer-type').value='BUSINESS';get('customer-type').fire('change');
 assert.equal(get('card-select').value,'','type change clears old product');
 assert.equal(get('assessment-result').children.length,0,'old report wiped');
 assert.equal(get('generate').disabled,true);
 assert.ok(get('card-select').options.some(x=>/Business/i.test(x.textContent)));
 get('issuer').value='CHASE';get('issuer').fire('change');
 assert.equal(get('customer-type').value,'','bank change clears prior card type');
 get('customer-type').value='PERSONAL';get('customer-type').fire('change');
 assert.ok(get('card-select').options.length>5);
 const freedom=get('card-select').options.find(x=>/Freedom Unlimited/i.test(x.textContent));
 assert.ok(freedom);
 get('card-select').value=freedom.value;get('card-select').fire('change');
 assert.match(get('summary').textContent,/Freedom/i);
 assert.equal(get('amex-offer-settings').hidden,true,'NLL control hidden for Chase');
 assert.equal(get('assessment-result').children.length,0,'Amex decision must not appear for Chase');
 assert.ok(requestLog.some(x=>x.includes('amex-formal-product-identities.json')));
 assert.ok(!requestLog.some(x=>!x.startsWith('data/')),'only static data requests');
 // Exercise the transient failure branch and successful retry on a fresh page.
 const retryContext={...context,window:null};
 // Reuse script/bootstrap module only after changing fetch to test the recovery path.
 let failure=true;
 const els2=new Map();
 function get2(id){
  if(!els2.has(id))els2.set(id,new Element(
   ['issuer','customer-type','card-select','offer-variant'].includes(id)?'select':'div'));
  return els2.get(id);
 }
 retryContext.document={getElementById:get2,
  createElement(tag){return new Element(tag);},
  createTextNode(value){return new Element('text');}};
 retryContext.fetch=async url=>{
  if(failure)throw Error('temporary unavailable');
  const file=path.join(root,url);
  return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
 };
 retryContext.window=retryContext;
 vm.createContext(retryContext);
 for(const src of scripts)vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),retryContext,
  {filename:src,timeout:3000});
 await settle();
 assert.equal(get2('retry').hidden,false,'a failed boot offers retry');
 assert.match(get2('summary').textContent,/初始化失败/);
 failure=false;
 get2('retry').fire('click');
 await settle();
 assert.equal(get2('retry').hidden,true,'retry succeeds without page reload');
 assert.equal(get2('issuer').disabled,false);
 assert.equal(get2('card-select').value,'');
 console.log(JSON.stringify({suite:'browser-startup-smoke',
  controls:'bank/type/card',identity:'exact id',onBoot:'no stale report',
  failureRetry:'works',amexAndChase:'verified',answersUploaded:false,status:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
