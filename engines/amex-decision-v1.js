/* AMEX local deterministic assessment. Outputs risk signals, not approval odds.
 * 23 source-defined executable rules are indexed; never promote meta rules. */
(function(root,factory){
const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
else root.NextBonusAmexDecisionV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const APP=new Set(['AMEX-006','AMEX-007','AMEX-008','AMEX-010','AMEX-011','AMEX-REL-001','AMEX-REL-002']);
const BONUS=new Set(['AMEX-001','AMEX-FL-001','AMEX-FL-002','AMEX-FL-003','AMEX-FL-004','AMEX-FL-005','AMEX-FL-006','AMEX-FL-007','AMEX-FL-008','AMEX-FL-009','AMEX-FL-010','AMEX-FL-012','AMEX-FL-013','AMEX-BIZ-001','AMEX-BIZ-002','AMEX-BIZ-005']);
const OLD=new Set(['该系列的旧版本','这些产品的旧版本','该卡旧版本','该卡的旧版本','以前的 SPG Business','以前的 SPG Luxury']);
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
        dim,'标准 Offer 家族条款下曾持有：'+matches.join('、')));
    }else if(id==='AMEX-BIZ-005'&&ambiguousLegacyBusiness){
      events.push(result(id,'TRIGGERED',dim,
        '已确认持有 Marriott Bonvoy Business 或其旧版 SPG Business；标准 Offer 均包含此历史'));
    }else if(held===null){
      events.push(result(id,'MISSING',dim,'需要相关 Amex Marriott 持卡经历'));
    }else{
      events.push(result(id,'CLEAR',dim,
        '未发现适用的 Amex Marriott lifetime / family 持卡历史'));
    }
    continue;
   }
   const scope=(policy.history_choices_by_rule[id]||[]).map(x=>x==='$TARGET'?product.product_name:x);
   if(!scope.length){events.push(result(id,'REVIEW',dim,'本规则没有审核过的持卡范围'));continue;}
   const verifiedMarriottTarget=id==='AMEX-001'&&
     product.product_name.startsWith('Marriott Bonvoy')&&
     knownMarriottNames.has(product.product_name);
   if(held===null&&!verifiedMarriottTarget){
     events.push(result(id,'MISSING',dim,'需要相关 Amex 持卡经历'));continue;
   }
   const hits=scope.filter(x=>(id==='AMEX-001'&&
     product.product_name.startsWith('Marriott Bonvoy'))
     ?knownMarriottNames.has(x):held.includes(x));
   events.push(result(id,!hits.length?'CLEAR':hits.some(x=>OLD.has(x))?'REVIEW':'TRIGGERED',dim,
    hits.length?'标准 Offer 假设下，持有历史：'+hits.join('、'):'未报告此规则所涵盖的持卡历史'));
   continue;
  }
  if(id==='AMEX-REL-001'||id==='AMEX-REL-002'){
   const v=a.F08_RELATIONSHIP;
   events.push(result(id,!['YES','NO'].includes(v)?'MISSING':v==='NO'?'TRIGGERED':'CLEAR',dim,
    v==='NO'?'尚未具备所需合作方账户':'请确认符合联名合作方的账户要求'));continue;
  }
  if(id==='AMEX-007'||id==='AMEX-008'){
   const n=a.F10_ISSUER_PORTFOLIO_COUNT,threshold=id==='AMEX-007'?5:10;
   events.push(result(id,!count(n)?'MISSING':n>=threshold?'TRIGGERED':'CLEAR',dim,
    count(n)?'对应类别持卡 '+n+' 张；参考阈值 '+threshold+'（非保证的硬上限）':'需要相关持卡数量'));continue;
  }
  if(id==='AMEX-006'){
   const n=activity.approved_revolving_90d;
   events.push(result(id,!count(n)?'MISSING':n>=2?'TRIGGERED':'CLEAR',dim,
    count(n)?'过去 90 天 Amex revolving 卡获批 '+n+' 张':'需要 90 天获批张数'));continue;
  }
  if(id==='AMEX-010'||id==='AMEX-011'){
   const field=id==='AMEX-010'?'approved_revolving_5d':'same_product_applied_or_approved_90d';
   const v=activity[field];
   events.push(result(id,!['YES','NO'].includes(v)?'MISSING':v==='YES'?'TRIGGERED':'CLEAR',dim,
    id==='AMEX-010'?'5 天内是否获批 Amex revolving 卡':'90 天内是否申请或获批该产品'));continue;
  }
 }
 if(marriottResult?.applicable){
   for(const row of marriottResult.rule_results||[]){
     events.push({...row});
   }
   if(marriottResult.status==='MISSING'&&!marriottResult.history_known){
     events.push(result('MARRIOTT-MATRIX','MISSING','BONUS',
       '还需要确认与目标卡有关的 Marriott/Ritz 历史'));
   }
 }
 for(const x of plan.diagnostics?.unresolved_system_gates||[]){
  if(x.rule_id.startsWith('AMEX')&&listed.has(x.rule_id))events.push(result(x.rule_id,'REVIEW',
   BONUS.has(x.rule_id)?'BONUS':'APPLICATION','Offer 条款缺少核实信息'));
 }
 for(const x of plan.diagnostics?.unresolved_target_mappings||[]){
  if(x.rule_id.startsWith('AMEX')&&listed.has(x.rule_id))events.push(result(x.rule_id,'REVIEW',
   BONUS.has(x.rule_id)?'BONUS':'APPLICATION','产品适用范围信息不足'));
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
   message:appStatus==='ELEVATED_RISK'?'存在 Amex 申请限制或风险信号':
    !baseComplete?'基础信用资料不足，暂无法计算通用风险档位':
    unresolvedApplication.length?'通用信用风险档位已计算；Amex 专属规则仍有待补充或核实的条件':
    '已完成通用风险档位及当前可执行的 Amex 规则检查（非获批保证）'},
  bonus:{status:bonusStatus,
   triggered_rules:bonus.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
   missing_rules:bonus.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
   message:bonusStatus==='LIKELY_RESTRICTED'?'标准 Offer 假设下可能触发 Welcome Bonus 限制':
    bonusStatus==='NEEDS_REVIEW'?'历史或规则尚需核实，不能确认奖励资格':
    '未发现已触发的奖励历史限制；并非保证获得开卡奖励'},
  rule_results:events,review_only:true,benefits_included:false,answers_transmitted:false,
  caveat:'本机模拟；没有数值获批概率；当前具体 Offer 条款和 Amex 审批决定以银行为准'};
}
return Object.freeze({version:'1',evaluate,approvalBase});
});