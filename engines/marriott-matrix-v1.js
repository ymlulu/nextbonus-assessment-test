/* Bank Rules.xlsx / Special Matrix — shared, read-only, on-device.
 * A matrix cell is target-specific. No automatic inference of date history.
 * LL cells belong to independent AMEX lifetime/family evaluation. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextBonusMarriottMatrixV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TARGETS=new Set(['Marriott Bonvoy Bevy','Marriott Bonvoy Brilliant',
  'Marriott Bonvoy Business American Express']);
const LABEL_TO_ID={
 'Chase Marriott Bonvoy Bold / Boundless':'chase_bold_boundless',
 'Chase Marriott Bonvoy Bountiful':'chase_bountiful',
 'Chase Ritz-Carlton':'chase_ritz_carlton',
 'Chase Marriott Business（历史卡）':'chase_marriott_business_legacy',
 'AMEX Marriott / Legacy SPG Personal':'amex_marriott_legacy_personal',
 'AMEX Marriott Bonvoy Bevy':'amex_marriott_bevy',
 'AMEX Marriott Bonvoy Brilliant':'amex_marriott_brilliant',
 'AMEX Marriott Bonvoy Business / Legacy SPG Business':'amex_marriott_business'
};
const QUESTIONS={
 held_now:{title:'这张卡目前还在持有吗？',type:'single'},
 closed_within_30d:{title:'如果已经关闭，这张卡是否在过去 30 天内关闭？',type:'single'},
 approved_within_90d:{title:'这张卡是否在过去 90 天内获批/开立？',type:'single'},
 bonus_or_upgrade_within_24m:{title:'过去 24 个月是否从这张卡获得开卡奖励或升级奖励？',type:'single'}
};
const YESNO=[{value:'YES',label:'是'},{value:'NO',label:'否'}];
function parseHistories(v){
 if(!Array.isArray(v)||v.length===0)return null;
 if(v.includes('NONE'))return v.length===1?[]:null;
 if(v.includes('UNKNOWN'))return null;
 const ids=new Set();
 for(const name of v){
  if(typeof name!=='string'||!LABEL_TO_ID[name])return null;
  ids.add(LABEL_TO_ID[name]);
 }
 return [...ids];
}
function conditionKey(kind){
 return kind==='held_now_or_closed_30d'
  ?['held_now','closed_within_30d']:[kind];
}
function condition(kind,data){
 if(kind==='held_now_or_closed_30d'){
  if(data.held_now==='YES')return true;
  if(data.held_now==='NO'){
   if(data.closed_within_30d==='YES')return true;
   if(data.closed_within_30d==='NO')return false;
  }
  return null;
 }
 const v=data[kind];return v==='YES'?true:v==='NO'?false:null;
}
function fields(kind,data){
 if(kind==='held_now_or_closed_30d'){
  if(data.held_now!=='YES'&&data.held_now!=='NO')return ['held_now'];
  return data.held_now==='NO'&&data.closed_within_30d!=='YES'&&
    data.closed_within_30d!=='NO'?['closed_within_30d']:[];
 }
 return data[kind]==='YES'||data[kind]==='NO'?[]:[kind];
}
function createMatrix(index){
 if(index?.schema_version!=='1'||index?.targets?.length!==5||
  index?.prior_products?.length!==8)throw Error('REVIEWED_MARRIOTT_MATRIX_REQUIRED');
 const byId=new Map(index.prior_products.map(x=>[x.id,x]));
 if(byId.size!==8)throw Error('DUPLICATE_MARRIOTT_PRIOR');
 const allowed=new Set(['OK','LL','LL / family',...Object.keys(index.interpretation)]);
 for(const p of index.prior_products){
  if(index.targets.some(t=>!allowed.has(p.cells[t.id])))throw Error('UNREVIEWED_MARRIOTT_CELL');
 }
 function evaluate({product,known_facts={}}={}){
  if(!product||!TARGETS.has(product.product_name))
   return {applicable:false,status:'NOT_APPLICABLE',rule_results:[],questions:[],
     history_known:false};
  const target=product.product_name,selected=parseHistories(known_facts.F07_MARRIOTT_HISTORY);
  if(selected===null)return {applicable:true,status:'MISSING',history_known:false,
    rule_results:[],questions:[{id:'F07_MARRIOTT_HISTORY',type:'multi',
      title:'你现在或以前持有过哪些 Marriott / Ritz-Carlton 信用卡？',
      description:'仅用于筛选与目标卡有关的限制，不需要填写与目标卡无关的产品。',
      options:index.prior_products.filter(p=>{
        const v=p.cells[target];return v!=='OK'&&v!=='LL'&&v!=='LL / family';
      }).map(p=>({value:Object.entries(LABEL_TO_ID).find(([,id])=>id===p.id)?.[0]||p.label,
        label:p.label})),allow_none:true,
      rule_ids:['MARRIOTT-MATRIX']}]};
  // Only the selected histories can ever influence the decision.
  // LL restrictions are evaluated by the separate AMEX family/lifetime rules.
  // A cross-issuer history list containing only LL/irrelevant products is clear
  // for this matrix, not proof that all lifetime restrictions are absent.
  const pending=[],events=[],questions=[];
  const facts=known_facts.F07_MARRIOTT_DETAILS&&typeof known_facts.F07_MARRIOTT_DETAILS==='object'?
    known_facts.F07_MARRIOTT_DETAILS:{};
  for(const id of selected){
   const prior=byId.get(id);if(!prior)continue;
   const cell=prior.cells[target];
   if(cell==='OK'||cell==='LL'||cell==='LL / family')continue;
   const clauses=index.interpretation[cell]||[];
   const current=facts[id]&&typeof facts[id]==='object'?facts[id]:{};
   const checks=clauses.map(type=>({type,result:condition(type,current),required:fields(type,current)}));
   const positive=checks.filter(x=>x.result===true);
   if(positive.length){
    events.push({rule_id:'MARRIOTT-MATRIX:'+id,dimension:'BONUS',
      status:'TRIGGERED',reason:'已满足 '+positive.map(x=>x.type).join('、')+
       ' 的跨银行限制条件（历史卡：'+prior.label+'）'});
    continue;
   }
   const unknown=checks.filter(x=>x.result===null);
   if(!unknown.length){
    events.push({rule_id:'MARRIOTT-MATRIX:'+id,dimension:'BONUS',
      status:'CLEAR',reason:'现有信息排除了 '+prior.label+' 的适用时间窗口'});
    continue;
   }
   pending.push(id);
   const needed=[...new Set(unknown.flatMap(x=>x.required))];
   const fieldsNeeded=needed.map(k=>({id:k,type:QUESTIONS[k].type,label:QUESTIONS[k].title,options:YESNO}));
   questions.push({id:'F07_MARRIOTT_DETAILS:'+id,type:'structured_marriott',
    prior_id:id,title:'确认 '+prior.label+' 的关键时间',description:'这里只问影响所选目标卡结论的历史；符合任一限制即可停止其他不必要追问。',
    fields:fieldsNeeded,rule_ids:['MARRIOTT-MATRIX:'+id]});
   events.push({rule_id:'MARRIOTT-MATRIX:'+id,dimension:'BONUS',
    status:'MISSING',reason:'缺少 '+prior.label+' 的决定性时间/持有事实'});
  }
  // A confirmed trigger resolves bonus eligibility under the assumed standard
  // matrix. Drop irrelevant pending questions, but still return explanation rows.
  if(events.some(e=>e.status==='TRIGGERED'))return{
   applicable:true,status:'TRIGGERED',history_known:true,
   rule_results:events,questions:[],pending_ids:[]};
  return{applicable:true,status:questions.length?'MISSING':'CLEAR',history_known:true,
   rule_results:events,questions,pending_ids:pending};
 }
 return Object.freeze({evaluate,version:'1',targetNames:[...TARGETS]});
}
return Object.freeze({version:'1',createMatrix,parseHistories});
});