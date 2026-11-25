/* AMEX local deterministic assessment. Outputs risk signals, not approval odds.
 * 23 source-defined executable rules are indexed; never promote meta rules. */
(function(root,factory){
const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
else root.NextBonusAmexDecisionV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const APP=new Set(['AMEX-006','AMEX-007','AMEX-008','AMEX-011','AMEX-REL-001','AMEX-REL-002']);
const BONUS=new Set(['AMEX-001','AMEX-FL-001','AMEX-FL-002','AMEX-FL-003','AMEX-FL-004','AMEX-FL-005','AMEX-FL-006','AMEX-FL-007','AMEX-FL-008','AMEX-FL-009','AMEX-FL-010','AMEX-FL-012','AMEX-FL-013','AMEX-BIZ-001','AMEX-BIZ-002','AMEX-BIZ-005']);
// Only unidentifiable old-version phrases are review-only. Named and mapped
// historical products (e.g. SPG predecessors) are actionable facts under the
// assumed standard offer's explicitly modeled family scope.
const OLD=new Set(['该系列的旧版本','该系列旧版本','这些产品的旧版本','该卡旧版本','该卡的旧版本']);
const AGE={NO_US_CARD:'None',LT_6M:'<6m',M6_11:'6–11m',Y1_2:'1–2y',Y2_PLUS:'2y+',UNKNOWN:'Unknown'};
const SCORE={SCORE_740_PLUS:'740+',SCORE_700_739:'700–739',SCORE_670_699:'670–699',SCORE_LT_670:'<670',UNKNOWN:'Unknown'};
const SEV={N0:0,N1:0,N2_3:1,N4_5:2,N6_PLUS:3};
const present=(obj,k)=>obj&&Object.prototype.hasOwnProperty.call(obj,k)&&obj[k]!==''&&obj[k]!=null&&obj[k]!=='UNKNOWN';
const count=x=>Number.isInteger(x)&&x>=0;
const result=(rule_id,status,dimension,reason)=>({rule_id,status,dimension,reason});
function history(v){if(!Array.isArray(v)||!v.length)return null;
 if(v.includes('UNKNOWN')||v.includes('NONE')&&v.length>1)return null;
 return v.includes('NONE')?[]:v.filter(x=>typeof x==='string');}
function approvalBase(a,config){
 const age=AGE[a.a1]||'Unknown',score=SCORE[a.a2]||'Unknown',s3=SEV[a.a3],s4=SEV[a.a4];
 if(age==='Unknown'||score==='Unknown'||s3===undefined||s4===undefined)
   return {rating:'INSUFFICIENT_DATA',activity:'UNKNOWN'};
 const activity=['LOW','MEDIUM','HIGH','VERY_HIGH'][Math.max(s3,s4)];
 const base=config.base_matrix?.[age]?.[score]||'INSUFFICIENT_DATA';
 const delta=config.activity_adjustment?.[activity]?.MEDIUM||0;
 const levels=['HIGH','MEDIUM','HIGH_RISK'],idx=levels.indexOf(base);
 return {rating:idx<0?base:levels[Math.min(2,idx+delta)],activity};
}
function evaluate({plan,product,answers={},policy,approvalConfig,offerContext,marriottResult}={}){
 if(product?.issuer!=='AMEX'||!plan?.questionnaire||!policy?.history_choices_by_rule||!approvalConfig)
  throw Error('AMEX_EVALUATION_INPUT_REQUIRED');
 const ids=new Set(plan.diagnostics?.applicable_rule_ids||[]),listed=new Set(policy.source.rule_ids);
 const a=answers&&typeof answers==='object'&&!Array.isArray(answers)?answers:{};
 const held=history(a.F03_CARD_HISTORY);
 const reportedMarriott=Array.isArray(a.F07_MARRIOTT_HISTORY)?
   a.F07_MARRIOTT_HISTORY:[];
 const knownMarriottNames=new Set([
   ...((held===null)?[]:held),
   ...reportedMarriott.map(x=>({
     'AMEX Marriott Bonvoy Bevy':'Marriott Bonvoy Bevy',
     'AMEX Marriott Bonvoy Brilliant':'Marriott Bonvoy Brilliant'
   })[x]).filter(Boolean)
 ]);
 const ambiguousLegacyBusiness=reportedMarriott.includes(
   'AMEX Marriott Bonvoy Business / Legacy SPG Business');
 const activity=a.F02_ISSUER_APPLICATION_HISTORY&&typeof a.F02_ISSUER_APPLICATION_HISTORY==='object'
  ?a.F02_ISSUER_APPLICATION_HISTORY:{};
 const events=[];
 for(const id of ids){
  if(!listed.has(id)||!APP.has(id)&&!BONUS.has(id))continue;
  const dim=APP.has(id)?'APPLICATION':'BONUS';
  if(BONUS.has(id)){
   // AMEX Marriott lifetime/family restrictions use prior AMEX holdings.
   // Cross-issuer 30/90/24 windows are resolved independently by the
   // source-backed target-by-history Marriott matrix.
   if(id==='AMEX-FL-012'||id==='AMEX-FL-013'||id==='AMEX-BIZ-005'){
    const scope=(policy.history_choices_by_rule[id]||[]);
    const matches=scope.filter(x=>knownMarriottNames.has(x));
    if(matches.length){
      events.push(result(id,matches.some(x=>OLD.has(x))?'REVIEW':'TRIGGERED',
        dim,'按普通开卡奖励条款，你以前办过：'+matches.join('、')));
    }else if(id==='AMEX-BIZ-005'&&ambiguousLegacyBusiness){
      events.push(result(id,'TRIGGERED',dim,
        '你办过 Marriott Bonvoy Business 或旧版 SPG Business，普通 Offer 可能拿不到奖励'));
    }else if(held===null){
      events.push(result(id,'MISSING',dim,'还需要知道你以前是否办过相关的 Marriott 卡'));
    }else{
      events.push(result(id,'CLEAR',dim,
        '没发现会影响这次奖励的 Amex Marriott 持卡记录'));
    }
    continue;
   }
   const scope=(policy.history_choices_by_rule[id]||[]).map(x=>x==='$TARGET'?product.product_name:x);
   if(!scope.length){events.push(result(id,'REVIEW',dim,'这条规则还没有对应的卡片名单，需要人工核实'));continue;}
   const verifiedMarriottTarget=id==='AMEX-001'&&
     product.product_name.startsWith('Marriott Bonvoy')&&
     knownMarriottNames.has(product.product_name);
   if(held===null&&!verifiedMarriottTarget){
     events.push(result(id,'MISSING',dim,'还需要确认你以前办过哪些 Amex 卡'));continue;
   }
   const hits=scope.filter(x=>(id==='AMEX-001'&&
     product.product_name.startsWith('Marriott Bonvoy'))
     ?knownMarriottNames.has(x):held.includes(x));
   events.push(result(id,!hits.length?'CLEAR':hits.some(x=>OLD.has(x))?'REVIEW':'TRIGGERED',dim,
    hits.length?'按普通 Offer 的条款，你以前办过：'+hits.join('、'):'没有选中会触发这条限制的信用卡'));
   continue;
  }
  if(id==='AMEX-REL-001'||id==='AMEX-REL-002'){
   const v=a.F08_RELATIONSHIP;
   events.push(result(id,!['YES','NO'].includes(v)?'MISSING':v==='NO'?'TRIGGERED':'CLEAR',dim,
    v==='NO'?'你目前没有申请这张联名卡所需的账户':'已选择有相关账户；还需以申请页面的要求为准'));continue;
  }
  if(id==='AMEX-007'||id==='AMEX-008'){
   const n=a.F10_ISSUER_PORTFOLIO_COUNT,threshold=id==='AMEX-007'?5:10;
   events.push(result(id,!count(n)?'MISSING':n>=threshold?'TRIGGERED':'CLEAR',dim,
    count(n)?'你现在持有 '+(n>=threshold?threshold+' 张或更多':'少于 '+threshold+' 张')+' 同类 Amex 卡；'+threshold+' 张是经验参考，并非一定会拒批':'还需要知道你现在持有几张同类 Amex 卡'));continue;
  }
  if(id==='AMEX-006'){
   const n=activity.approved_revolving_90d;
   events.push(result(id,!count(n)?'MISSING':n>=2?'TRIGGERED':'CLEAR',dim,
    count(n)?'过去 90 天获批的 Amex 普通信用卡为 '+(n>=2?'2 张或更多':'0–1 张'):'还需要知道过去 90 天获批了几张 Amex 普通信用卡'));continue;
  }
  if(id==='AMEX-011'){
   const v=activity.same_product_applied_or_approved_90d;
   events.push(result(id,!['YES','NO'].includes(v)?'MISSING':v==='YES'?'TRIGGERED':'CLEAR',dim,
    '过去 90 天有没有申请过这张卡'));continue;
  }
 }
 if(marriottResult?.applicable){
   for(const row of marriottResult.rule_results||[]){
     events.push({...row});
   }
   if(marriottResult.status==='MISSING'&&!marriottResult.history_known){
     events.push(result('MARRIOTT-MATRIX','MISSING','BONUS',
       '还需要确认你以前办过哪些 Marriott / Ritz-Carlton 卡'));
   }
 }
 for(const x of plan.diagnostics?.unresolved_system_gates||[]){
  if(x.rule_id.startsWith('AMEX')&&listed.has(x.rule_id))events.push(result(x.rule_id,'REVIEW',
   BONUS.has(x.rule_id)?'BONUS':'APPLICATION','还没有核实这次申请链接的奖励条款'));
 }
 for(const x of plan.diagnostics?.unresolved_target_mappings||[]){
  if(x.rule_id.startsWith('AMEX')&&listed.has(x.rule_id))events.push(result(x.rule_id,'REVIEW',
   BONUS.has(x.rule_id)?'BONUS':'APPLICATION','暂时不能确定这条规则是否适用于这张卡'));
 }
 const app=events.filter(x=>x.dimension==='APPLICATION'),bonus=events.filter(x=>x.dimension==='BONUS');
 const any=(e,s)=>e.some(x=>x.status===s);
 const base=approvalBase(a,approvalConfig);
 const appStatus=any(app,'TRIGGERED')?'ELEVATED_RISK':
  any(app,'MISSING')||any(app,'REVIEW')||base.rating==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'MODEL_ONLY';
 const baseComplete=base.rating!=='INSUFFICIENT_DATA';
 const unresolvedApplication=app.filter(x=>x.status==='MISSING'||x.status==='REVIEW');
 const missingApplication=unresolvedApplication.filter(x=>x.status==='MISSING');
 const reviewApplication=unresolvedApplication.filter(x=>x.status==='REVIEW');
 const bonusStatus=any(bonus,'TRIGGERED')?'LIKELY_RESTRICTED':
  any(bonus,'MISSING')||any(bonus,'REVIEW')?'NEEDS_REVIEW':'NO_TRIGGER_FOUND';
 return{contract_version:'1',issuer:'AMEX',product_id:product.product_id,
  offer_variant:offerContext?.variant||'STANDARD',
  assumption:offerContext?.assumption||'UNVERIFIED_STANDARD_OFFER_MODEL',
  application:{status:appStatus,base_risk:base.rating,activity:base.activity,
   base_completed:baseComplete,
   issuer_rules_completed:unresolvedApplication.length===0,
   triggered_rules:app.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
   missing_rules:missingApplication.map(x=>x.rule_id),
   unresolved_rules:unresolvedApplication.map(x=>({rule_id:x.rule_id,
     status:x.status,reason:x.reason})),
   message:appStatus==='ELEVATED_RISK'?'发现可能影响这次 Amex 申请的情况':
    !baseComplete?'信用记录还有几项没填，暂时算不出基础风险档位':
    unresolvedApplication.length?'基础信用情况已经算好了，但还有几项 Amex 申请记录需要确认':
    '已检查基础信用情况和适用的 Amex 申请规则；是否获批仍以银行为准'},
  bonus:{status:bonusStatus,
   triggered_rules:bonus.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
   missing_rules:bonus.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
   message:bonusStatus==='LIKELY_RESTRICTED'?'按普通 Offer 的条款，你这次可能拿不到开卡奖励':
    bonusStatus==='NEEDS_REVIEW'?'还需要确认几项持卡历史，暂时无法判断开卡奖励资格':
    '目前没发现已触发的开卡奖励限制，但最终以申请条款为准'},
  rule_results:events,review_only:true,benefits_included:false,answers_transmitted:false,
  caveat:'这是根据已填信息做的初步评估，不代表 Amex 的实际审批结果。具体开卡奖励请以申请页面条款为准。'};
}
return Object.freeze({version:'1',evaluate,approvalBase});
});