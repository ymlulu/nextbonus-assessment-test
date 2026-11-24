/* Chase-specific question wording and choices, rendered by the SAME shared QA UI
 * as Amex. No local storage, network request, or new frontend.
 * Source rule IDs and canonical card product values are never user text. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusChaseQuestionnaireV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const HISTORY_MODES=new Set(['held_current','held_ever','current_or_bonus','club_current_or_bonus']);
const BONUS_MODES=new Set(['bonus_history','current_or_bonus','club_current_or_bonus']);
function createEnricher({policy}){
 if(policy?.issuer!=='CHASE'||!policy?.rules||!policy?.question_templates)
  throw Error('CHASE_REVIEWED_QUESTIONNAIRE_POLICY_REQUIRED');
 const rules=policy.rules,templates=policy.question_templates;
 function mapped(names,product){
  return [...new Set((names||[]).map(x=>x==='$TARGET'?product.product_name:x).filter(Boolean))]
    .map(value=>({value,label:policy.history_display_names?.[value]||value}));
 }
 function choices(ruleIds,product,key){
  const names=[];
  for(const id of ruleIds){
   const rule=rules[id];
   if(!rule)continue;
   for(const item of rule[key]||[])names.push(item);
  }
  return mapped(names,product);
 }
 function enrich({plan,product,known_facts={}}){
  if(product?.issuer!=='CHASE')return plan;
  if(!plan?.questionnaire||!plan.diagnostics)throw Error('QUESTIONNAIRE_PLAN_REQUIRED');
  const unresolved=[];
  const specific=[];
  for(const q of plan.questionnaire.specific){
   const template=templates[q.id];
   if(!template){specific.push(q);continue;}
   const output={...q,...template,rule_ids:[...(q.rule_ids||[])]};
   if(q.id==='F02_ISSUER_APPLICATION_HISTORY'){
    const needed=new Set(output.rule_ids);
    output.fields=(template.fields||[]).filter(f=>f.rule_ids.some(id=>needed.has(id)))
      .map(({rule_ids,...rest})=>rest);
   }else if(q.id==='F03_CARD_HISTORY'){
    const historyIds=output.rule_ids.filter(id=>HISTORY_MODES.has(rules[id]?.mode));
    output.options=choices(historyIds,product,'history_scope');
    const ever=historyIds.some(id=>rules[id]?.mode==='held_ever');
    output.title=ever
      ?'下面这些 Chase 商业卡，你现在或以前办过哪些？'
      :'下面这些 Chase 卡，你现在还持有哪些？';
    output.description=ever
      ?'以前办过、后来关掉的也算；即使当时没拿到开卡奖励，也请选上。'
      :'只选现在还没有关掉的卡。过去拿过开卡奖励的记录会在下一题单独问。';
    output.allow_none=true;
   }else if(q.id==='F04_BONUS_HISTORY'){
    const bonusIds=output.rule_ids.filter(id=>BONUS_MODES.has(rules[id]?.mode));
    output.options=choices(bonusIds,product,'bonus_scope');
    const lifetime=bonusIds.some(id=>rules[id]?.bonus_window==='EVER');
    output.title=lifetime
      ?'你以前拿过下面哪张卡的新卡开卡奖励？'
      :'过去 24 个月，你拿到过下面哪些卡的新卡开卡奖励？';
    output.description=lifetime
      ?'不管是几年前拿到的，都请选上；这不是问你现在有没有持卡。'
      :'只选过去 24 个月实际拿到奖励的卡；更早拿到的不用选。';
    output.allow_none=true;
   }
   if((q.id==='F03_CARD_HISTORY'||q.id==='F04_BONUS_HISTORY')&&!output.options.length){
    unresolved.push(...output.rule_ids);
    continue;
   }
   if(q.id==='F06_AU_BREAKDOWN'){
    const primary=known_facts.F01_RECENT_NEW_ACCOUNTS;
    // Five primary card openings already satisfy 5/24; AU detail cannot undo it.
    if(Number.isInteger(primary)&&primary>=5)continue;
   }
   specific.push(output);
  }
  const pending=[...(plan.questionnaire.pending_terms||[]),
    ...[...new Set(unresolved)].map(id=>({
      rule_id:id,title:'相关卡片的历史范围还需核实',
      status:'SYSTEM_TERMS_UNVERIFIED',
      reason:'没有足够明确的持卡或奖励对应关系，不能要求你猜答案。',
      potential_fact_groups:[],history_scope:[]
    }))];
  return {...plan,questionnaire:{...plan.questionnaire,specific,pending_terms:pending},
   diagnostics:{...plan.diagnostics,chase_rules_documented:Object.keys(rules).length},
   evaluation_ready:false};
 }
 return Object.freeze({enrich});
}
return Object.freeze({version:'1',createEnricher});
});