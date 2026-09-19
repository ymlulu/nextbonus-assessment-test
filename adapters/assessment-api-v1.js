(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../engines/assessment-core-v1.js'));
  else root.AssessmentApiV1=factory(root.AssessmentCoreV1);
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core)throw Error('AssessmentApiV1 requires AssessmentCoreV1');

  const CONTRACT_VERSION='1';
  const SUPPORTED_LOCALES=['zh-CN'];
  let offerHistoryPromise=null,offerHistoryLoadAttempted=false;

  class AssessmentApiError extends Error{
    constructor(code,message,status){super(message);this.name='AssessmentApiError';this.code=code;this.status=status||400}
  }

  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
  function releaseId(runtime){return runtime&&runtime.manifest&&runtime.manifest.release_id||null}
  function requireRuntime(runtime){if(!runtime||!runtime.products||!runtime.questions||!runtime.longTerm)throw new AssessmentApiError('RUNTIME_UNAVAILABLE','Assessment runtime is unavailable',503)}
  function requireProduct(productId,runtime){requireRuntime(runtime);const product=(runtime.products.cards||{})[productId];if(!product)throw new AssessmentApiError('UNKNOWN_PRODUCT','Unknown product_id: '+productId,404);return product}
  function localeOf(locale){const value=locale||'zh-CN';if(!SUPPORTED_LOCALES.includes(value))throw new AssessmentApiError('UNSUPPORTED_LOCALE','Unsupported locale: '+value,400);return value}
  function evaluationDateOf(value){if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new AssessmentApiError('INVALID_EVALUATION_DATE','evaluation_date must be YYYY-MM-DD',400);return value}

  function valueAtPath(rootValue,path){
    return String(path||'').split('.').filter(Boolean).reduce((value,key)=>value==null?undefined:value[key],rootValue);
  }

  function systemGateOk(gate,productId,runtime){
    if(!gate)return true;
    const facts=(((runtime||{}).frozenOfferFacts||{}).products||{})[productId]||{};
    const actual=gate.fact?facts[gate.fact]:valueAtPath(facts,gate.path);
    if(Object.prototype.hasOwnProperty.call(gate,'equals'))return actual===gate.equals;
    return false;
  }

  function filterQuestionnaireNode(node,productId,runtime){
    if(node==null||typeof node!=='object')return node;
    if(node.system_gate&&!systemGateOk(node.system_gate,productId,runtime))return null;
    if(Array.isArray(node))return node.map(child=>filterQuestionnaireNode(child,productId,runtime)).filter(child=>child!==null);
    const copy={};
    for(const [key,value] of Object.entries(node)){
      if(key==='system_gate')continue;
      const filtered=filterQuestionnaireNode(value,productId,runtime);
      if(filtered!==null)copy[key]=filtered;
    }
    return copy;
  }

  function collectSpecificIds(node,out,productId,runtime){
    if(!node||typeof node!=='object')return out;
    if(node.system_gate&&!systemGateOk(node.system_gate,productId,runtime))return out;
    if(node.id)out.add(node.id);
    if(node.number_id)out.add(node.number_id);
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)collectSpecificIds(child,out,productId,runtime);
      else if(value&&typeof value==='object')collectSpecificIds(value,out,productId,runtime);
    }
    return out;
  }

  function toInternalAnswers(productId,flatAnswers,runtime){
    const flat=flatAnswers&&typeof flatAnswers==='object'&&!Array.isArray(flatAnswers)?flatAnswers:{};
    const answers={specific:{},q7:[],q8:[]};
    for(const q of runtime.questions.common||[])answers[q.id]=Object.prototype.hasOwnProperty.call(flat,q.id)?flat[q.id]:null;
    const specificIds=collectSpecificIds((runtime.questions.cards||{})[productId],new Set(),productId,runtime);
    for(const id of specificIds)if(Object.prototype.hasOwnProperty.call(flat,id))answers.specific[id]=clone(flat[id]);
    answers.q7Answered=Object.prototype.hasOwnProperty.call(flat,'q7');
    answers.q8Answered=Object.prototype.hasOwnProperty.call(flat,'q8');
    answers.q7=answers.q7Answered&&Array.isArray(flat.q7)?[...flat.q7]:[];
    answers.q8=answers.q8Answered&&Array.isArray(flat.q8)?[...flat.q8]:[];
    return answers;
  }

  function benefitQuestion(number,key,title,items,noneOption){
    return{
      id:key,
      number:'Q'+number,
      title,
      type:'multi',
      none_option:noneOption,
      options:(items||[]).map(x=>({value:x.id,label:x.label,short:x.short||null,annual_value:x.annual_value==null?null:x.annual_value}))
    };
  }

  function offerHistoryFor(productId,evaluationDate,runtime){
    const product=(runtime.products.cards||{})[productId];
    const timingId=product&&product.offer_timing_id;
    const source=timingId&&runtime.offerHistory&&runtime.offerHistory[timingId];
    const current=source&&source.current;
    const currentTime=Date.parse(evaluationDate);
    if(!current||current.display_eligible!==true||!Number.isFinite(current.comparable_value)||!Number.isFinite(currentTime))return null;
    const history=(Array.isArray(source.history)?source.history:[])
      .filter(e=>e.display_eligible===true&&e.timing_eligible==='YES'&&e.confidence==='HIGH'&&e.comparison_unit===current.comparison_unit&&Number.isFinite(e.comparable_value)&&e.bonus_label&&e.date_label&&Number.isFinite(Date.parse(e.date))&&Date.parse(e.date)<=currentTime)
      .map(e=>({
        date:e.date,
        date_label:e.date_label,
        bonus_label:e.bonus_label,
        spend_requirement:e.spend_requirement||null,
        comparable_value:e.comparable_value,
        comparison_unit:e.comparison_unit,
        timing_eligible:e.timing_eligible,
        confidence:e.confidence,
        display_eligible:true
      }));
    return{
      offer_timing_id:timingId,
      snapshot:runtime.manifest&&runtime.manifest.offer_history&&runtime.manifest.offer_history.snapshot||null,
      current:{
        offer_label:current.offer_label,
        comparable_value:current.comparable_value,
        comparison_unit:current.comparison_unit,
        offer_mechanism:current.offer_mechanism||null,
        evaluation_date:evaluationDate,
        display_eligible:true
      },
      history
    };
  }

  function getVersion({runtime}){
    requireRuntime(runtime);
    return{
      contract_version:CONTRACT_VERSION,
      release_id:releaseId(runtime),
      supported_locales:[...SUPPORTED_LOCALES],
      engine_versions:clone((runtime.manifest||{}).engine||{}),
      source_lock:clone((runtime.manifest||{}).source_lock||null)
    };
  }

  function getProductAssessment({productId,runtime,locale}){
    const product=requireProduct(productId,runtime),resolvedLocale=localeOf(locale),lt=runtime.longTerm.cards[productId],q=runtime.questions;
    if(!lt)throw new AssessmentApiError('PRODUCT_NOT_READY','Product is missing long-term/questionnaire runtime data',409);
    return{
      contract_version:CONTRACT_VERSION,
      release_id:releaseId(runtime),
      locale:resolvedLocale,
      product:{
        product_id:productId,
        name:product.name,
        issuer:product.issuer,
        application_url:product.application_url||null,
        article_url:product.article_url||null
      },
      questionnaire:{
        common:clone(q.common||[]),
        specific:filterQuestionnaireNode((q.cards||{})[productId]||{},productId,runtime),
        benefits:{
          q7:benefitQuestion(7,'q7',(q.benefit_questions||{}).q7_title,lt.q7,(q.benefit_questions||{}).none_option),
          q8:benefitQuestion(8,'q8',(q.benefit_questions||{}).q8_title,lt.q8,(q.benefit_questions||{}).none_option)
        }
      }
    };
  }

  function getOfferHistory({productId,evaluationDate,runtime}){
    requireProduct(productId,runtime);
    const date=evaluationDateOf(evaluationDate);
    return clone(offerHistoryFor(productId,date,runtime));
  }

  function getOfferTiming({productId,runtime}){
    requireProduct(productId,runtime);
    const timing=runtime.timing&&runtime.timing[productId];
    if(!timing) throw new AssessmentApiError('PRODUCT_NOT_READY','Product is missing Offer Timing runtime data',409);
    return{
      contract_version:CONTRACT_VERSION,
      release_id:releaseId(runtime),
      product_id:productId,
      offer_timing_id:timing.offer_timing_id||null,
      snapshot_date:timing.snapshot_date||null,
      current_offer:clone(timing.current_offer||null),
      timing_result:clone(timing.timing_result||null)
    };
  }

  function evaluate({request,runtime,cards,engines}){
    requireRuntime(runtime);
    if(!runtime.offerHistory&&!offerHistoryLoadAttempted&&typeof window!=='undefined'&&typeof fetch==='function'){
      const path=runtime.manifest&&runtime.manifest.offer_history&&runtime.manifest.offer_history.path;
      if(path){
        offerHistoryLoadAttempted=true;
        offerHistoryPromise=fetch(path,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
        return offerHistoryPromise.then(data=>{if(data)runtime.offerHistory=data;return evaluate({request,runtime,cards,engines});});
      }
    }
    const body=request&&typeof request==='object'?request:{};
    const productId=body.product_id;
    const product=requireProduct(productId,runtime);
    const locale=localeOf(body.locale);
    const evaluationDate=evaluationDateOf(body.evaluation_date);
    if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))throw new AssessmentApiError('INVALID_ANSWERS','answers must be an object keyed by questionnaire id',400);
    const answers=toInternalAnswers(productId,body.answers,runtime);
    const result=Core.evaluate({productId,answers,runtime,cards,evaluationDate,engines});
    const timing=runtime.timing[productId];
    return{
      contract_version:CONTRACT_VERSION,
      release_id:releaseId(runtime),
      locale,
      evaluation_date:evaluationDate,
      product_id:productId,
      product_name:product.name,
      decision:{
        internal_state:result.output.internalState,
        recommended_action:result.output.recommendedAction,
        summary:result.output.summary
      },
      dimensions:{
        application:{
          approval:result.output.adjustedApproval,
          approval_label:result.output.approvalLabel,
          hard_behavior:result.bank.applicationHardBehavior,
          soft_impact:result.bank.applicationSoftImpact
        },
        bonus:{
          status:result.output.bonusStatus,
          label:result.output.bonusLabel,
          hard_behavior:result.bank.bonusHardBehavior
        },
        offer:{
          rating:result.output.offerRating,
          wait_recommendation:timing.timing_result.wait
        },
        long_term:{
          code:result.longTerm.code,
          label:result.longTerm.label
        }
      },
      report:{
        application_text:result.report.applicationText,
        bonus_text:result.report.bonusText,
        offer_text:result.report.offerText,
        approval_text:result.report.approvalText,
        long_term_text:result.report.longText,
        cta:clone(result.report.cta)
      },
      offer_history:offerHistoryFor(productId,evaluationDate,runtime),
      provenance:clone(result.provenance)
    };
  }

  function errorBody(error){
    const e=error instanceof AssessmentApiError?error:new AssessmentApiError('INTERNAL_ERROR','Assessment evaluation failed',500);
    return{status:e.status,body:{contract_version:CONTRACT_VERSION,error:{code:e.code,message:e.message}}};
  }

  return{
    contractVersion:CONTRACT_VERSION,
    supportedLocales:[...SUPPORTED_LOCALES],
    getVersion,
    getProductAssessment,
    getOfferHistory,
    getOfferTiming,
    evaluate,
    toInternalAnswers,
    systemGateOk,
    filterQuestionnaireNode,
    errorBody,
    AssessmentApiError
  };
});