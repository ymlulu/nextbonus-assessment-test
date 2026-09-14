(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../engines/assessment-core-v1.js'));
  else root.AssessmentApiV1=factory(root.AssessmentCoreV1);
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core)throw Error('AssessmentApiV1 requires AssessmentCoreV1');

  const CONTRACT_VERSION='1';
  const SUPPORTED_LOCALES=['zh-CN'];

  class AssessmentApiError extends Error{
    constructor(code,message,status){super(message);this.name='AssessmentApiError';this.code=code;this.status=status||400}
  }

  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
  function releaseId(runtime){return runtime&&runtime.manifest&&runtime.manifest.release_id||null}
  function requireRuntime(runtime){if(!runtime||!runtime.products||!runtime.questions||!runtime.longTerm)throw new AssessmentApiError('RUNTIME_UNAVAILABLE','Assessment runtime is unavailable',503)}
  function requireProduct(productId,runtime){requireRuntime(runtime);const product=(runtime.products.cards||{})[productId];if(!product)throw new AssessmentApiError('UNKNOWN_PRODUCT','Unknown product_id: '+productId,404);return product}
  function localeOf(locale){const value=locale||'zh-CN';if(!SUPPORTED_LOCALES.includes(value))throw new AssessmentApiError('UNSUPPORTED_LOCALE','Unsupported locale: '+value,400);return value}

  function collectSpecificIds(node,out){
    if(!node||typeof node!=='object')return out;
    if(node.id)out.add(node.id);
    if(node.number_id)out.add(node.number_id);
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)collectSpecificIds(child,out);
      else if(value&&typeof value==='object')collectSpecificIds(value,out);
    }
    return out;
  }

  function toInternalAnswers(productId,flatAnswers,runtime){
    const flat=flatAnswers&&typeof flatAnswers==='object'&&!Array.isArray(flatAnswers)?flatAnswers:{};
    const answers={specific:{},q7:[],q8:[]};
    for(const q of runtime.questions.common||[])answers[q.id]=Object.prototype.hasOwnProperty.call(flat,q.id)?flat[q.id]:null;
    const specificIds=collectSpecificIds((runtime.questions.cards||{})[productId],new Set());
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
        specific:clone((q.cards||{})[productId]||{}),
        benefits:{
          q7:benefitQuestion(7,'q7',(q.benefit_questions||{}).q7_title,lt.q7,(q.benefit_questions||{}).none_option),
          q8:benefitQuestion(8,'q8',(q.benefit_questions||{}).q8_title,lt.q8,(q.benefit_questions||{}).none_option)
        }
      }
    };
  }

  function evaluate({request,runtime,cards,engines}){
    requireRuntime(runtime);
    const body=request&&typeof request==='object'?request:{};
    const productId=body.product_id;
    const product=requireProduct(productId,runtime);
    const locale=localeOf(body.locale);
    if(!body.evaluation_date||!/^\d{4}-\d{2}-\d{2}$/.test(body.evaluation_date))throw new AssessmentApiError('INVALID_EVALUATION_DATE','evaluation_date must be YYYY-MM-DD',400);
    if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))throw new AssessmentApiError('INVALID_ANSWERS','answers must be an object keyed by questionnaire id',400);
    const answers=toInternalAnswers(productId,body.answers,runtime);
    const result=Core.evaluate({productId,answers,runtime,cards,evaluationDate:body.evaluation_date,engines});
    const timing=runtime.timing[productId];
    return{
      contract_version:CONTRACT_VERSION,
      release_id:releaseId(runtime),
      locale,
      evaluation_date:body.evaluation_date,
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
    evaluate,
    toInternalAnswers,
    errorBody,
    AssessmentApiError
  };
});
