/* Chase on-device issuer decision model based on reviewed Bank Rules source.
 * Presentation/output contract matches Amex. No network, persistence or AI.
 * Rule ID, dimension and trigger scope are owned by chase-questionnaire-policy.json. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusChaseDecisionV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const AGE={NO_US_CARD:'None',LT_6M:'<6m',M6_11:'6–11m',Y1_2:'1–2y',Y2_PLUS:'2y+',UNKNOWN:'Unknown'};
const SCORE={SCORE_740_PLUS:'740+',SCORE_700_739:'700–739',SCORE_670_699:'670–699',SCORE_LT_670:'<670',UNKNOWN:'Unknown'};
const SEV={N0:0,N1:0,N2_3:1,N4_5:2,N6_PLUS:3};
const count=v=>Number.isInteger(v)&&v>=0;
const yesNo=v=>v==='YES'||v==='NO';
function approvalBase(a,config){
 const age=AGE[a.a1]||'Unknown',score=SCORE[a.a2]||'Unknown';
 const s3=SEV[a.a3],s4=SEV[a.a4];
 if(age==='Unknown'||score==='Unknown'||s3===undefined||s4===undefined)
  return {rating:'INSUFFICIENT_DATA',activity:'UNKNOWN'};
 const activity=['LOW','MEDIUM','HIGH','VERY_HIGH'][Math.max(s3,s4)];
 const base=config.base_matrix?.[age]?.[score]||'INSUFFICIENT_DATA';
 const adjustment=config.activity_adjustment?.[activity]?.MEDIUM||0;
 const levels=['HIGH','MEDIUM','HIGH_RISK'],idx=levels.indexOf(base);
 return {rating:idx<0?base:levels[Math.min(2,idx+adjustment)],activity};
}
function selected(v){
 if(!Array.isArray(v)||!v.length||v.includes('UNKNOWN')||
    (v.includes('NONE')&&v.length>1))return null;
 return v.includes('NONE')?[]:v.filter(x=>typeof x==='string');
}
function resolved(scope,product){return (scope||[]).map(x=>x==='$TARGET'?product.product_name:x);}
function matches(history,scope,product){
 if(history===null)return null;
 return resolved(scope,product).filter(x=>history.includes(x));
}
const event=(rule_id,status,dimension,reason,trigger_sources=[])=>({rule_id,status,dimension,reason,
 ...(trigger_sources.length?{trigger_sources}:{})});
const evidence=(question_id,hits,prefix,suffix='')=>(hits||[]).map(value=>({
 question_id,value,reason:prefix+value+suffix
}));
function evaluate({plan,product,answers={},policy,approvalConfig,marriottResult}={}){
 if(product?.issuer!=='CHASE'||!plan?.diagnostics||!policy?.rules||!approvalConfig)
  throw Error('CHASE_EVALUATION_INPUT_REQUIRED');
 const a=answers&&typeof answers==='object'&&!Array.isArray(answers)?answers:{};
 const active=new Set(plan.diagnostics.applicable_rule_ids||[]);
 const current=selected(a.F03_CARD_HISTORY);
 const bonus=selected(a.F04_BONUS_HISTORY);
 const activity=a.F02_ISSUER_APPLICATION_HISTORY&&
   typeof a.F02_ISSUER_APPLICATION_HISTORY==='object'&&!Array.isArray(a.F02_ISSUER_APPLICATION_HISTORY)
   ?a.F02_ISSUER_APPLICATION_HISTORY:{};
 const events=[];
 for(const id of active){
  if(!id.startsWith('CHASE'))continue;
  const rule=policy.rules[id];
  const dimension=rule?.dimension||'APPLICATION';
  if(!rule){
   // Do not declare an uncompiled source rule cleared.
   events.push(event(id,'REVIEW',dimension,
    '这条规则的具体判断还没完成核对，暂时不能据此判断是否符合条件'));
   continue;
  }
  if(rule.mode==='five_twentyfour'){
   const n=a.F01_RECENT_NEW_ACCOUNTS,au=a.F06_AU_BREAKDOWN;
   if(!count(n))events.push(event(id,'MISSING','APPLICATION',
       '还要知道过去 24 个月你本人新开了几张信用卡'));
   else if(n>=5)events.push(event(id,'TRIGGERED','APPLICATION',
       '过去 24 个月本人新开了 5 张或更多信用卡，已达到 Chase 5/24。'+
       (product.product_name==='Amazon Prime Visa'?' Amazon Prime Visa 有过例外报告，但不能保证获批。':'')));
   else if(n===4&&!count(au))events.push(event(id,'MISSING','APPLICATION',
       '目前有 4 张本人新账户，还需要确认信用报告里有没有副卡'));
   else if(n===4&&au>0)events.push(event(id,'REVIEW','APPLICATION',
       '本人新账户 4 张，另有至少 1 张副卡；系统可能一并计算，是否能人工排除不确定'));
   else events.push(event(id,'CLEAR','APPLICATION',
       '本人新账户 '+(n===4?'4 张':'0–3 张')+'，没有达到 5/24 的本人主卡门槛；副卡及信用报告记录可能另需核实'));
   continue;
  }
  if(rule.mode==='approval_30d'){
   const n=activity.approved_chase_30d;
   events.push(event(id,!count(n)?'MISSING':n>=2?'TRIGGERED':'CLEAR',dimension,
    count(n)?'过去 30 天 Chase 信用卡获批 '+(n>=2?'2 张或更多':'0–1 张'):'还要知道过去 30 天获批了几张 Chase 卡'));
   continue;
  }
  if(rule.mode==='business_30d'){
   const v=activity.approved_chase_business_30d;
   events.push(event(id,!yesNo(v)?'MISSING':v==='YES'?'TRIGGERED':'CLEAR',dimension,
    !yesNo(v)?'还要确认近 30 天有没有 Chase 商业卡获批':
    v==='YES'?'过去 30 天已有 Chase 商业卡获批，近期再申请通常需要谨慎':
    '过去 30 天没有 Chase 商业卡获批记录'));
   continue;
  }
  if(rule.mode==='held_current'||rule.mode==='held_ever'){
   const hits=matches(current,rule.history_scope,product);
   if(hits===null)events.push(event(id,'MISSING',dimension,
     rule.mode==='held_ever'?'还需要确认以前办过哪些相关 Chase 商业卡':
       '还需要确认目前持有哪些相关 Chase 卡'));
   else if(hits.includes('OTHER_CHASE_NO_FEE_BUSINESS')&&
      hits.every(x=>x==='OTHER_CHASE_NO_FEE_BUSINESS'))
    events.push(event(id,'REVIEW',dimension,
      '你曾办过其他无年费 Chase 商业卡，需核对具体卡片是否属于条款涵盖范围'));
   else events.push(event(id,hits.length?'TRIGGERED':'CLEAR',dimension,
     hits.length?(rule.mode==='held_ever'?'以前办过：':'目前持有：')+hits.join('、')+
       (rule.soft?'，按当前参考条款可能影响开卡奖励':''):
       '没发现这条规则涉及的相关持卡记录',
     evidence('F03_CARD_HISTORY',hits.filter(x=>x!=='OTHER_CHASE_NO_FEE_BUSINESS'),rule.mode==='held_ever'?'以前办过 ':'目前持有 ')));
   continue;
  }
  if(rule.mode==='bonus_history'){
   const hits=matches(bonus,rule.bonus_scope,product);
   events.push(event(id,hits===null?'MISSING':hits.length?'TRIGGERED':'CLEAR',dimension,
    hits===null?(rule.bonus_window==='EVER'?
      '还要确认你以前是否拿过这张卡的开卡奖励':
      '还要确认近 24 个月拿过哪些相关卡的开卡奖励'):
    hits.length?'你拿过相关开卡奖励：'+hits.join('、'):
      '没有报告这条规则范围内的开卡奖励记录',
    evidence('F04_BONUS_HISTORY',hits,rule.bonus_window==='EVER'?'以前拿过 ':'过去 24 个月拿过 ',' 的开卡奖励')));
   continue;
  }
  if(rule.mode==='current_or_bonus'||rule.mode==='club_current_or_bonus'){
   const held=matches(current,rule.history_scope,product);
   const awarded=matches(bonus,rule.bonus_scope,product);
   if((held&&held.length)||(awarded&&awarded.length)){
    const reason=[...(held?.length?['目前持有 '+held.join('、')]:[]),
      ...(awarded?.length?['近 24 个月拿过 '+awarded.join('、')+' 的开卡奖励']:[])].join('；');
    events.push(event(id,'TRIGGERED',dimension,reason,[
     ...evidence('F03_CARD_HISTORY',held,'目前持有 '),
     ...evidence('F04_BONUS_HISTORY',awarded,'过去 24 个月拿过 ',' 的开卡奖励')
    ]));
   }else if(held===null||awarded===null){
    events.push(event(id,'MISSING',dimension,
     '还要确认这张卡目前是否持有，以及近 24 个月有没有拿过相关开卡奖励'));
   }else events.push(event(id,'CLEAR',dimension,
    '没有发现目前持卡或近 24 个月拿奖励的相关限制'));
   continue;
  }
  events.push(event(id,'REVIEW',dimension,'判断方式尚未核实，不能擅自认定符合条件'));
 }
 for(const x of plan.diagnostics.unresolved_system_gates||[]){
  if(x.rule_id.startsWith('CHASE'))events.push(event(x.rule_id,'REVIEW','BONUS',
   '这次开卡奖励的具体条款还需要核实'));
 }
 for(const x of plan.diagnostics.unresolved_target_mappings||[]){
  if(x.rule_id.startsWith('CHASE'))events.push(event(x.rule_id,'REVIEW','APPLICATION',
   '卡片资料还不够完整，暂时不能判断这条规则是否适用'));
 }
 // Explicit product availability is a hard gate, unlike approval-frequency
 // or underwriting signals. Keep the source dimension and a single event
 // per rule, but propagate its result to application and bonus eligibility.
 for(const x of events){
  if(x.dimension==='APPLICATION'&&policy.rules[x.rule_id]?.product_eligibility===true)
   x.product_eligibility=true;
 }
 if(marriottResult?.applicable)events.push(...marriottResult.rule_results);
 const app=events.filter(x=>x.dimension==='APPLICATION');
 const bonusEvents=events.filter(x=>x.dimension==='BONUS'||x.product_eligibility);
 const productBlockers=app.filter(x=>x.product_eligibility&&x.status==='TRIGGERED');
 const productBlockingRules=productBlockers.map(x=>x.rule_id);
 const hardBonusBlockers=bonusEvents.filter(x=>x.hard_bonus_eligibility&&x.status==='TRIGGERED');
 const any=(rs,status)=>rs.some(x=>x.status===status);
 const base=approvalBase(a,approvalConfig);
 const incomplete=app.filter(x=>x.status==='MISSING'||x.status==='REVIEW');
 const appStatus=productBlockers.length?'PRODUCT_INELIGIBLE':
  any(app,'TRIGGERED')?'ELEVATED_RISK':
  incomplete.length||base.rating==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'MODEL_ONLY';
 const bonusStatus=productBlockers.length?'PRODUCT_INELIGIBLE':
  hardBonusBlockers.length?'BONUS_INELIGIBLE':
  any(bonusEvents,'TRIGGERED')?'LIKELY_RESTRICTED':
  any(bonusEvents,'MISSING')||any(bonusEvents,'REVIEW')?'NEEDS_REVIEW':'NO_TRIGGER_FOUND';
 return {
  contract_version:'1',issuer:'CHASE',product_id:product.product_id,
  offer_variant:'STANDARD',assumption:'UNVERIFIED_STANDARD_OFFER_MODEL',
  application:{
   status:appStatus,base_risk:base.rating,activity:base.activity,
   base_completed:base.rating!=='INSUFFICIENT_DATA',
   issuer_rules_completed:!incomplete.length,
   triggered_rules:app.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
   product_blocking_rules:productBlockingRules,
   missing_rules:app.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
   unresolved_rules:incomplete.map(x=>({rule_id:x.rule_id,status:x.status,reason:x.reason})),
   message:appStatus==='PRODUCT_INELIGIBLE'?
     '按目前参考条款，你不符合这张卡的申请条件：'+productBlockers.map(x=>x.reason).join('；'):
    appStatus==='ELEVATED_RISK'?
     '发现可能影响这次 Chase 申请的限制或风险':
    base.rating==='INSUFFICIENT_DATA'?'信用记录还有几项没填，暂时算不出基础风险档位':
    incomplete.length?'基础信用情况已经算好了，但还有几项 Chase 申请记录需要确认':
    '已检查基础信用情况和目前能确认的 Chase 规则；是否获批仍以银行为准'
  },
  bonus:{
   status:bonusStatus,
   triggered_rules:bonusEvents.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
   product_blocking_rules:productBlockingRules,
   missing_rules:bonusEvents.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
   message:bonusStatus==='PRODUCT_INELIGIBLE'?
     '按目前参考条款，你不符合这次开卡奖励条件，因为已触发明确的产品申请限制':
    bonusStatus==='BONUS_INELIGIBLE'?
     '按目前参考条款，你不符合这次开卡奖励条件：'+hardBonusBlockers.map(x=>x.reason).join('；'):
    bonusStatus==='LIKELY_RESTRICTED'?
     '按目前参考条款，你这次可能拿不到开卡奖励':
     bonusStatus==='NEEDS_REVIEW'?'还要确认持卡或奖励记录，才能判断开卡奖励资格':
     '目前没发现已触发的开卡奖励限制，但不代表保证拿到奖励'
  },
  rule_results:events,review_only:true,benefits_included:false,answers_transmitted:false,
  caveat:'这是独立测试版，按已审核的规则快照模拟。具体申请、最新开卡奖励条款和是否获批，以 Chase 当前页面及银行决定为准。答案仅在本机处理。'
 };
}
return Object.freeze({version:'1',evaluate,approvalBase});
});