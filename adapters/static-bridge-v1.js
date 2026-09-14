(function(){
  'use strict';

  const CHANNEL='nextbonus-assessment-v1';
  const METHODS=new Set(['getVersion','getProductAssessment','evaluate']);
  let runtimePromise=null;

  function allowedOrigin(origin){
    try{
      const u=new URL(origin);
      if(u.origin==='https://nextbonus-preview.pages.dev')return true;
      if(u.origin==='https://ymlulu.github.io')return true;
      if((u.hostname==='localhost'||u.hostname==='127.0.0.1')&&(u.protocol==='http:'||u.protocol==='https:'))return true;
      return false;
    }catch(e){return false}
  }

  async function json(path){
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok)throw Error('Failed to load '+path);
    return response.json();
  }

  function mergeReport(base,policy){
    return{
      ...base,
      ...policy,
      rule_templates:{...(base.rule_templates||{}),...(policy.rule_templates||{})},
      rule_template_index:{...(base.rule_template_index||{}),...(policy.rule_template_index||{})},
      offer_display:{...(base.offer_display||{}),...(policy.offer_display||{})},
      long_term_templates:{...(base.long_term_templates||{}),...(policy.long_term_templates||{})}
    };
  }

  async function loadRuntime(){
    if(runtimePromise)return runtimePromise;
    runtimePromise=(async()=>{
      const manifest=await json('data/runtime-manifest.json');
      const keys=['bank_rules','bank_rule_predicates','offer_timing','approval','long_term','orchestrator','report_templates','report_render_policy','products','questions','fact_mapping','frozen_offer_facts'];
      const values=await Promise.all(keys.map(key=>json(manifest[key].path)));
      const [rules,predicates,timing,approval,longTerm,orchestrator,reportBase,reportPolicy,products,questions,factMapping,frozenOfferFacts]=values;
      return{
        manifest,
        rules,
        predicates,
        timing,
        approval,
        longTerm,
        orchestrator,
        reportTemplates:mergeReport(reportBase,reportPolicy),
        products,
        questions,
        factMapping,
        frozenOfferFacts
      };
    })();
    return runtimePromise;
  }

  function engines(){
    return{
      factNormalizer:window.FactNormalizerV3,
      bankRule:window.BankRuleEngine,
      approval:window.ApprovalEngineV2,
      longTerm:window.LongTermEngineV2,
      orchestrator:window.OrchestratorEngineV2,
      reportRenderer:window.ReportRendererV2
    };
  }

  async function invoke(method,params){
    if(!METHODS.has(method))throw new AssessmentApiV1.AssessmentApiError('UNSUPPORTED_METHOD','Unsupported bridge method: '+method,400);
    const runtime=await loadRuntime();
    if(method==='getVersion')return AssessmentApiV1.getVersion({runtime});
    if(method==='getProductAssessment')return AssessmentApiV1.getProductAssessment({productId:params&&params.product_id,runtime,locale:params&&params.locale});
    return AssessmentApiV1.evaluate({request:params&&params.request,runtime,engines:engines()});
  }

  window.addEventListener('message',async event=>{
    const message=event.data;
    if(!message||message.channel!==CHANNEL||!message.request_id||!METHODS.has(message.method))return;
    if(!allowedOrigin(event.origin))return;
    try{
      const result=await invoke(message.method,message.params||{});
      event.source.postMessage({channel:CHANNEL,request_id:message.request_id,ok:true,result},event.origin);
    }catch(error){
      const payload=AssessmentApiV1.errorBody(error);
      event.source.postMessage({channel:CHANNEL,request_id:message.request_id,ok:false,error:payload.body.error,status:payload.status},event.origin);
    }
  });

  loadRuntime().catch(error=>console.error('Assessment static bridge failed to initialize',error));
})();
