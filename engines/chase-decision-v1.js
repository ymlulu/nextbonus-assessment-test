/* Local Chase applicant/bonus rule assessment.
 * Evaluates only 21 compiled source rules after exact product routing.
 * A1-A4 score uses the same common matrix as Amex; no approval probabilities.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextBonusChaseDecisionV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const positive=x=>x==='YES'?true:x==='NO'?false:null;
 const numeric=x=>Number.isInteger(x)&&x>=0;
 function evaluate({plan,product,answers={},policy,approvalConfig,approvalBase}={}){
  if(product?.issuer!=='CHASE'||!plan?.diagnostics||
     policy?.issuer!=='CHASE'||typeof approvalBase!=='function')
   throw Error('CHASE_REVIEWED_DECISION_INPUT_REQUIRED');
  const ids=plan.diagnostics.applicable_rule_ids||[];
  const a=answers&&typeof answers==='object'?answers:{};
  const activity=a.F02_ISSUER_APPLICATION_HISTORY||{};
  const held=a.F03_CARD_HISTORY||{};
  const bonuses=a.F04_BONUS_HISTORY||{};
  const results=[];
  const base=approvalBase(a,approvalConfig);
  const yesNo=check=>{
   if(check==='current_target'||check==='current_family'||
      check==='ever_target'||check==='ever_other_no_fee_ink')
    return positive(held[check]);
   if(check==='bonus_target_ever'||check==='bonus_target_24m'||
      check==='bonus_family_24m')
    return positive(bonuses[check]);
   return null;
  };
  function checkStatus(check){
   if(check==='five_twentyfour'){
    const n=a.F01_RECENT_NEW_ACCOUNTS;
    const au=a.F06_AU_BREAKDOWN;
    if(!numeric(n))return {status:'MISSING',why:'还需要填写过去 24 个月信用报告上的新信用卡账户数量'};
    if(n<5)return {status:'CLEAR',why:'信用报告新增 '+n+' 张，未达到 Chase 5/24 的参考门槛'};
    if(!numeric(au)||au>n)return {status:'MISSING',why:'信用报告新增 '+n+' 张；需要确认其中有多少张是副卡'};
    if(n-au>=5)return {status:'TRIGGERED',why:'扣除副卡后，过去 24 个月本人新增 '+(n-au)+' 张信用卡，已达到 5/24'};
    return {status:'REVIEW',why:'信用报告共新增 '+n+' 张，其中有 '+au+' 张副卡；Chase 自动审查可能先计入副卡，人工复议能否排除不能保证'};
   }
   if(check==='chase_30d'){
    const n=activity.chase_approved_30d;
    return !numeric(n)?{status:'MISSING',why:'还需要填写过去 30 天获批的 Chase 卡数量'}:
     n>=2?{status:'TRIGGERED',why:'过去 30 天获批 '+n+' 张 Chase 卡，已达到 2/30 的参考限制'}:
     {status:'CLEAR',why:'过去 30 天获批 '+n+' 张 Chase 卡'};
   }
   if(check==='chase_business_30d'){
    const n=activity.chase_business_approved_30d;
    return !numeric(n)?{status:'MISSING',why:'还需要填写过去 30 天获批的 Chase 商业卡数量'}:
     n>=1?{status:'TRIGGERED',why:'过去 30 天已获批 '+n+' 张 Chase 商业卡，近期再申请可能更难（经验规则）'}:
     {status:'CLEAR',why:'过去 30 天没有获批 Chase 商业卡'};
   }
   const answer=yesNo(check);
   return answer===null?{status:'MISSING',why:'还需要确认相关持卡或开卡奖励历史'}:
    answer?{status:'TRIGGERED',why:
      check==='current_target'?'你现在还持有这张卡':
      check==='current_family'?'你现在还持有同系列的另一张个人卡':
      check==='ever_target'?'你以前办过这张卡':
      check==='ever_other_no_fee_ink'?'你以前办过其他免年费 Ink Business 卡':
      check==='bonus_target_ever'?'你以前拿到过这张卡的开卡奖励':
      check==='bonus_target_24m'?'过去 24 个月你拿到过这张卡的开卡奖励':
      '过去 24 个月你拿到过同系列个人卡的开卡奖励'}:
    {status:'CLEAR',why:'按你填写的记录，这项限制没有触发'};
  }
  for(const id of ids){
   const spec=policy.rule_checks[id];
   if(!spec)continue;
   const all=[].concat(spec.check).map(checkStatus);
   const triggered=all.find(x=>x.status==='TRIGGERED');
   const missing=all.find(x=>x.status==='MISSING');
   const review=all.find(x=>x.status==='REVIEW');
   const status=triggered?'TRIGGERED':review?'REVIEW':missing?'MISSING':'CLEAR';
   results.push({rule_id:id,dimension:spec.dimension,status,
    impact:spec.impact,reason:triggered?.why||review?.why||missing?.why||
       all.map(x=>x.why).join('；')});
  }
  const app=results.filter(x=>x.dimension==='APPLICATION');
  const bonus=results.filter(x=>x.dimension==='BONUS');
  const applicationStatus=app.some(x=>x.status==='TRIGGERED')?'ELEVATED_RISK':
    app.some(x=>x.status==='MISSING'||x.status==='REVIEW')||
       base.rating==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'MODEL_ONLY';
  const bonusStatus=bonus.some(x=>x.status==='TRIGGERED')?'LIKELY_RESTRICTED':
    bonus.some(x=>x.status==='MISSING'||x.status==='REVIEW')?'NEEDS_REVIEW':'NO_TRIGGER_FOUND';
  const outstanding=app.filter(x=>x.status==='MISSING'||x.status==='REVIEW');
  return{
   contract_version:'1',issuer:'CHASE',product_id:product.product_id,
   offer_variant:'STANDARD',assumption:'REVIEWED_2026_SOURCE_NOT_LIVE_TERMS',
   application:{
    status:applicationStatus,base_risk:base.rating,activity:base.activity,
    base_completed:base.rating!=='INSUFFICIENT_DATA',
    issuer_rules_completed:outstanding.length===0,
    triggered_rules:app.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
    missing_rules:app.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
    unresolved_rules:outstanding.map(x=>({rule_id:x.rule_id,status:x.status,reason:x.reason})),
    message:applicationStatus==='ELEVATED_RISK'?'有一些 Chase 申请规则需要注意，近期获批可能更难':
      base.rating==='INSUFFICIENT_DATA'?'信用记录还有几项没填，暂时算不出基础信用档位':
      outstanding.length?'基础信用情况已计算，部分 Chase 申请记录还需确认':
      '目前没有发现已触发的 Chase 申请限制；是否获批仍以银行为准'
   },
   bonus:{
    status:bonusStatus,
    triggered_rules:bonus.filter(x=>x.status==='TRIGGERED').map(x=>x.rule_id),
    missing_rules:bonus.filter(x=>x.status==='MISSING').map(x=>x.rule_id),
    message:bonusStatus==='LIKELY_RESTRICTED'?'根据已填历史，部分开卡奖励可能拿不到；请核对本次 Offer 条款':
      bonusStatus==='NEEDS_REVIEW'?'还需要确认持卡或奖励历史，暂时无法判断开卡奖励资格':
      '目前没发现已触发的 Chase 开卡奖励限制；不保证一定能拿到奖励'
   },
   rule_results:results,review_only:true,benefits_included:false,
   answers_transmitted:false,
   caveat:'Chase 规则按已审核的历史资料建模，尚未逐一核实当前申请链接的 Offer 条款；部分规则属于经验限制。此评估只在本机计算，不等于银行审核结果。'
  };
 }
 return Object.freeze({version:'1',evaluate});
});