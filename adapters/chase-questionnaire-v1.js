/* Source-backed Chase question copy for the same UI used by Amex.
 * No new rule predicates, source mutation, answer submission or network access. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextBonusChaseQuestionnaireV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const yesNo=[{value:'NO',label:'没有'},{value:'YES',label:'有'}];
 function createEnricher({policy}){
  if(policy?.issuer!=='CHASE'||Object.keys(policy.rule_checks||{}).length!==21)
   throw Error('CHASE_REVIEWED_POLICY_REQUIRED');
  const checks=policy.rule_checks,defs=policy.fields;
  function neededFields(ids,group){
   const keys=new Set();
   for(const id of ids){
    const checksForRule=[].concat(checks[id]?.check||[]);
    for(const check of checksForRule){
     if(group==='F02_ISSUER_APPLICATION_HISTORY'){
      if(check==='chase_30d')keys.add('chase_approved_30d');
      if(check==='chase_business_30d')keys.add('chase_business_approved_30d');
     }else if(group==='F03_CARD_HISTORY'){
      if(['current_target','current_family','ever_target','ever_other_no_fee_ink'].includes(check))
       keys.add(check);
     }else if(group==='F04_BONUS_HISTORY'){
      if(['bonus_target_ever','bonus_target_24m','bonus_family_24m'].includes(check))
       keys.add(check);
     }
    }
   }
   return [...keys];
  }
  function enrich({plan,product,known_facts={}}){
   if(product?.issuer!=='CHASE')return plan;
   const specific=[];
   for(const q of plan.questionnaire.specific){
    const t=defs[q.id];
    if(!t){specific.push(q);continue;}
    if(q.id==='F06_AU_BREAKDOWN'){
     const reported=known_facts.F01_RECENT_NEW_ACCOUNTS;
     if(Number.isInteger(reported)&&reported<5)continue;
    }
    const output={...q,title:t.title,description:t.description,type:t.type,
      rule_ids:q.rule_ids};
    if(q.id==='F01_RECENT_NEW_ACCOUNTS'){
     output.title=t.question;output.max=t.max;
    }else if(q.id==='F06_AU_BREAKDOWN'){
     output.title='其中有几张是别人给你加的副卡？';
     output.max=t.max;
    }else if(t.type==='structured'){
     const needed=neededFields(q.rule_ids,q.id);
     output.fields=needed.map(k=>({...t.fields[k],id:k,
       ...(t.fields[k].type==='single'?{options:yesNo}:null)}));
     if(!output.fields.length)continue;
    }
    specific.push(output);
   }
   // Any product with incomplete exact-name metadata is handled conservatively
   // by the shared planner. Never invent target-card restrictions.
   return {...plan,questionnaire:{...plan.questionnaire,specific},
    diagnostics:{...plan.diagnostics,chase_rule_definitions:21}};
  }
  return Object.freeze({enrich});
 }
 return Object.freeze({version:'1',createEnricher});
});