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
// Presentation groups use the SAME canonical per-card fact fields as the
// matrix conditions. Never combine new-card-only and upgrade-inclusive rules.
const GROUP_TITLES={
 held_now:'下面这些卡，你现在还持有哪些？',
 closed_within_30d:'下面这些已关卡或转卡的卡，过去 30 天内你还持有过哪些？',
 approved_within_90d:'过去 90 天内，你申请并获批过下面哪些卡？',
 new_card_bonus_within_24m:'过去 24 个月，你拿过下面哪些卡的开卡奖励？（不包括升级奖励）',
 bonus_or_upgrade_within_24m:'过去 24 个月，你拿过下面哪些卡的开卡奖励或升级奖励？'
};
const groupId=field=>'F07_MARRIOTT_GROUP:'+field;
function groupQuestions(groups,answeredOnly=false){
 return Object.entries(GROUP_TITLES).flatMap(([field,title])=>{
  const options=(groups.get(field)||[]).filter(o=>!answeredOnly||o.answered);
  if(!options.length)return [];
  return [{id:groupId(field),type:'marriott_multi',fact_field:field,title,
   description:'只列出与你刚才选择的持卡历史及本次申请条款有关的卡。勾选符合条件的卡；都不符合就选以上都没有。',
   options,allow_none:true,rule_ids:options.map(o=>'MARRIOTT-MATRIX:'+o.value)}];
 });
}
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
  const chase=product?.issuer==='CHASE';
  const target=chase?index.chase_targets?.[product?.product_name]:
    product?.issuer==='AMEX'&&TARGETS.has(product.product_name)?product.product_name:null;
  if(!target||!index.targets.some(x=>x.id===target))
   return {applicable:false,status:'NOT_APPLICABLE',rule_results:[],questions:[],
     history_known:false};
  const isProductGate=id=>chase&&index.policy.chase_product_gates?.[target]?.includes(id);
  const labelFor=p=>chase?(index.chase_history_labels?.[p.id]||p.label):p.label;
  const choiceFor=p=>Object.entries(LABEL_TO_ID).find(([,id])=>id===p.id)?.[0]||p.label;
  const selected=parseHistories(known_facts.F07_MARRIOTT_HISTORY);
  if(selected===null)return {applicable:true,status:'MISSING',history_known:false,
    rule_results:chase?[
      {rule_id:'MARRIOTT-MATRIX:product-history',dimension:'APPLICATION',product_eligibility:true,status:'MISSING',reason:'还要确认有没有办过这张卡对应的 Chase Marriott 卡'},
      {rule_id:'MARRIOTT-MATRIX:cross-bank-history',dimension:'BONUS',status:'MISSING',reason:'还要确认有没有办过可能影响开卡奖励的 Amex Marriott 卡'}
    ]:[],questions:[{id:'F07_MARRIOTT_HISTORY',type:'multi',
      title:'下面这些 Marriott / Ritz-Carlton 卡，你办过哪些？',
      description:chase?'包括已经关掉的卡。只列出可能影响这次申请或开卡奖励的产品。':'包括已经关掉的卡。只列出可能影响你这次开卡奖励的产品。',
      options:index.prior_products.filter(p=>{
        const v=p.cells[target];return v!=='OK'&&v!=='LL'&&v!=='LL / family';
      }).map(p=>({value:choiceFor(p),label:labelFor(p),prior_id:p.id})),allow_none:true,
      rule_ids:['MARRIOTT-MATRIX']}]};
  // Only the selected histories can ever influence the decision.
  // LL restrictions are evaluated by the separate AMEX family/lifetime rules.
  // A cross-issuer history list containing only LL/irrelevant products is clear
  // for this matrix, not proof that all lifetime restrictions are absent.
  const pending=[],events=[],groups=new Map();
  const facts=known_facts.F07_MARRIOTT_DETAILS&&typeof known_facts.F07_MARRIOTT_DETAILS==='object'?
    known_facts.F07_MARRIOTT_DETAILS:{};
  for(const id of selected){
   const prior=byId.get(id);if(!prior)continue;
   const cell=prior.cells[target];
   if(cell==='OK'||cell==='LL'||cell==='LL / family')continue;
   const productGate=isProductGate(id),label=labelFor(prior);
   const clauses=(index.interpretation[cell]||[]).map(kind=>
    productGate&&kind==='bonus_or_upgrade_within_24m'?'new_card_bonus_within_24m':kind);
   const current=facts[id]&&typeof facts[id]==='object'?facts[id]:{};
   const eventBase={rule_id:'MARRIOTT-MATRIX:'+id,dimension:productGate?'APPLICATION':'BONUS',
    ...(productGate?{product_eligibility:true}:chase?{hard_bonus_eligibility:true}:{})};
   const checks=clauses.map(type=>({type,result:condition(type,current),required:fields(type,current)}));
   const positive=checks.filter(x=>x.result===true);
   const unknown=checks.filter(x=>x.result===null);
   // Preserve answered options in the same group for editing. Only include
   // a close-date option after confirming that its card is no longer held.
   // Chase QA keeps independent conditions available even after a trigger;
   // Amex still short-circuits after a decisive bonus blocker.
   const required=new Set(chase||!positive.length?unknown.flatMap(x=>x.required):[]);
   for(const field of new Set(clauses.flatMap(conditionKey))){
    if(field==='closed_within_30d'&&current.held_now!=='NO')continue;
    const answered=current[field]==='YES'||current[field]==='NO';
    if(!answered&&!required.has(field))continue;
    if(!groups.has(field))groups.set(field,[]);
    groups.get(field).push({value:id,label,answered,pending:!answered&&required.has(field)});
   }
   if(positive.length){
    const reasons={held_now:'目前仍持有相关卡',closed_within_30d:'过去 30 天内持有过相关卡',
      approved_within_90d:'过去 90 天内申请并获批相关卡',
      bonus_or_upgrade_within_24m:'过去 24 个月拿过开卡或升级奖励',
      new_card_bonus_within_24m:'过去 24 个月拿过开卡奖励'};
    const fields=positive.map(x=>x.type==='held_now_or_closed_30d'?
      current.held_now==='YES'?'held_now':'closed_within_30d':x.type);
    const reason=chase?label+'：'+fields.map(k=>reasons[k]).join('；'):
      '根据 '+prior.label+' 的持卡时间或奖励记录，这次开卡奖励可能受限（条件：'+positive.map(x=>x.type).join('、')+'）';
    events.push({...eventBase,status:'TRIGGERED',reason,
      trigger_sources:[
        {question_id:'F07_MARRIOTT_HISTORY',value:choiceFor(prior),reason},
        ...fields.map(field=>({question_id:groupId(field),value:id,reason:reasons[field]}))
      ]});
    continue;
   }
   if(!unknown.length){
    events.push({...eventBase,status:'CLEAR',reason:'按目前填写的时间，'+label+' 的相关限制没有触发'});
    continue;
   }
   pending.push(id);
   events.push({...eventBase,status:'MISSING',reason:'还需要确认 '+label+' 的持卡或拿奖励时间'});
  }
  // A confirmed trigger resolves bonus eligibility under the assumed standard
  // matrix. Drop irrelevant pending questions, but still return explanation rows.
  if(!chase&&events.some(e=>e.status==='TRIGGERED'))return{
   applicable:true,status:'TRIGGERED',history_known:true,
   rule_results:events,questions:[],editable_questions:groupQuestions(groups,true),pending_ids:[]};
  // Chase must keep checking card availability even after a bonus-only
  // blocker, and retain every independent answer for QA.
  const editable_questions=groupQuestions(groups);
  const questions=editable_questions.filter(q=>q.options.some(o=>o.pending));
  return{applicable:true,status:events.some(e=>e.status==='TRIGGERED')?'TRIGGERED':pending.length?'MISSING':'CLEAR',history_known:true,
   rule_results:events,questions,editable_questions,pending_ids:pending};
 }
 return Object.freeze({evaluate,version:'1',targetNames:[...TARGETS,...Object.keys(index.chase_targets||{})]});
}
return Object.freeze({version:'1',createMatrix,parseHistories});
});