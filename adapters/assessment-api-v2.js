/* Versioned local assessment contract. The bank-rule runtime is the only evaluator. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('../engines/bank-rules-runtime.js'),require('./card-identity-v1.js'));
 else root.NextBonusAssessmentV2=factory(root.NextBonusBankRulesRuntime,root.NextBonusCardIdentityV1);
})(typeof globalThis!=='undefined'?globalThis:this,function(Rules,Identity){
'use strict';
const VERSION='2';
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function createClient({rulebook,factbook,products,approval,identityIndex}){
 const lookup=Identity.createLookup(identityIndex);
 const runtime=Rules.createRuntime({rulebook,factbook,products,approval});
 const facade=runtime.createFacade(lookup);
 const version={contract_version:VERSION,...facade.getVersion()};
 const plan=request=>({...facade.plan(request),contract_version:VERSION,release_id:version.release_id});
 function reportFromPlan(result){
  if(result?.contract_version!==VERSION||result?.release_id!==version.release_id||!result.evaluation||!result.identity)return null;
  const e=result.evaluation;
  return {contract_version:VERSION,release_id:version.release_id,product:{...result.identity},
   offer_variant:e.offer_variant,decision:e.decision,dimensions:{application:e.application,bonus:e.bonus},
   rule_results:e.rule_results,offer_context:result.offer_context,diagnostics:result.questionnaire.diagnostics,
   marriott_matrix:result.marriott_matrix,benefits:{status:'NOT_IN_SCOPE'},
   caveat:e.caveat,answers_transmitted:false};
 }
 function evaluate(request){
  const result=plan(request);return {...result,report:reportFromPlan(result)};
 }
 function knownProduct(id){
  const p=lookup.findById(id);
  if(!p||!rulebook.supported_issuers.includes(p.issuer))throw Error('UNKNOWN_OR_UNSUPPORTED_PRODUCT');
  return p;
 }
 function getOfferHistory({product_id,offerHistory,evaluation_date}={}){
  const p=knownProduct(product_id);
  if(evaluation_date!==undefined&&!validDate(evaluation_date))throw Error('INVALID_EVALUATION_DATE');
  const source=offerHistory?.[p.offer_timing_id],ref=source?.current;
  if(!ref||ref.display_eligible!==true||!Number.isFinite(ref.comparable_value)||!validDate(ref.evaluation_date))return null;
  const end=evaluation_date&&evaluation_date<ref.evaluation_date?evaluation_date:ref.evaluation_date;
  if(end<ref.evaluation_date)return null; // Do not compare against a reference offer from the future.
  const history=(source.history||[]).filter(row=>row.display_eligible===true&&row.timing_eligible==='YES'&&row.confidence==='HIGH'&&
    row.comparison_unit===ref.comparison_unit&&Number.isFinite(row.comparable_value)&&row.bonus_label&&row.date_label&&validDate(row.date)&&row.date<=end)
    .map(row=>({date:row.date,date_label:row.date_label,bonus_label:row.bonus_label,spend_requirement:row.spend_requirement||null,
     comparable_value:row.comparable_value,comparison_unit:row.comparison_unit,confidence:row.confidence,display_eligible:true,timing_eligible:'YES'}))
    .sort((a,b)=>a.date.localeCompare(b.date));
  return {product_id,offer_timing_id:p.offer_timing_id,reference_date:ref.evaluation_date,historical_reference_only:true,
   reference_offer:{offer_label:ref.offer_label,comparable_value:ref.comparable_value,comparison_unit:ref.comparison_unit,offer_mechanism:ref.offer_mechanism||null},history};
 }
 function getOfferTiming({product_id,offerTiming}={}){
  const p=knownProduct(product_id),record=offerTiming?.[product_id];
  if(!record||record.offer_timing_id!==p.offer_timing_id||!validDate(record.snapshot_date))return null;
  return {product_id,offer_timing_id:p.offer_timing_id,snapshot_date:record.snapshot_date,historical_reference_only:true,
   reference_offer:record.current_offer||null,timing_result:record.timing_result||null};
 }
 return Object.freeze({getVersion:()=>({...version}),listCards:facade.listCards,
  ruleLabels:runtime.ruleLabels,plan,evaluate,reportFromPlan,getOfferHistory,getOfferTiming});
}
return Object.freeze({contractVersion:VERSION,createClient});
});
