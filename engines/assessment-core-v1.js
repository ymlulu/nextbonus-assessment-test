(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AssessmentCoreV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

  function provenance(runtime,evaluationDate){
    const manifest=runtime.manifest||{},contracts={};
    for(const [key,value] of Object.entries(manifest)){
      if(value&&typeof value==='object'&&value.path&&value.git_blob_sha){
        contracts[key]={snapshot:value.snapshot||null,path:value.path,git_blob_sha:value.git_blob_sha};
      }
    }
    return{
      release_id:manifest.release_id||null,
      evaluation_date:evaluationDate,
      engine_versions:{...(manifest.engine||{})},
      runtime_contracts:contracts,
      source_lock:manifest.source_lock?{...manifest.source_lock}:null
    };
  }

  function fallbackCard(productId,product,longTerm){
    return{
      key:productId,
      name:product.name,
      issuer:product.issuer,
      approvalIssuer:product.approval_issuer||product.issuer,
      sensitivity:product.sensitivity,
      annualFee:longTerm.annual_fee,
      article:product.article_url,
      applicationUrl:product.application_url,
      q7:(longTerm.q7||[]).map(x=>({id:x.id,label:x.label,annualValue:x.annual_value,short:x.short})),
      q8:(longTerm.q8||[]).map(x=>({id:x.id,label:x.label,short:x.short}))
    };
  }

  function requireEngine(engines,key,method){
    const engine=engines&&engines[key];
    if(!engine||typeof engine[method]!=='function')throw Error(`Missing Assessment Core engine ${key}.${method}`);
    return engine;
  }

  function evaluate({productId,answers,runtime,cards,evaluationDate,engines}){
    if(!runtime||!runtime.products||!runtime.longTerm||!runtime.timing)throw Error('Missing Assessment Core runtime');
    if(!productId)throw Error('Missing productId');
    if(!evaluationDate||!DATE_RE.test(evaluationDate))throw Error('Missing or invalid evaluationDate; pass frozen YYYY-MM-DD assessment input');

    const product=(runtime.products.cards||{})[productId];
    const longTermConfig=(runtime.longTerm.cards||{})[productId];
    const timing=runtime.timing[productId];
    const card=(cards&&cards[productId])||(product&&longTermConfig?fallbackCard(productId,product,longTermConfig):null);
    if(!card||!product||!longTermConfig||!timing)throw Error('Missing runtime config for '+productId);

    const factNormalizer=requireEngine(engines,'factNormalizer','normalize');
    const bankRule=requireEngine(engines,'bankRule','evaluate');
    const approvalEngine=requireEngine(engines,'approval','evaluate');
    const longTermEngine=requireEngine(engines,'longTerm','evaluate');
    const orchestrator=requireEngine(engines,'orchestrator','evaluate');
    const reportRenderer=requireEngine(engines,'reportRenderer','render');
    const inputAnswers=answers||{};
    const frozen=((runtime.frozenOfferFacts&&runtime.frozenOfferFacts.products)||{})[productId]||{};

    const facts=factNormalizer.normalize(productId,inputAnswers,runtime.factMapping);
    const bank=bankRule.evaluate({
      targetProduct:product,
      frozenOfferFacts:frozen,
      facts,
      evaluationDate,
      rules:runtime.rules,
      predicates:runtime.predicates
    });
    const approval=approvalEngine.evaluate({
      cardKey:productId,
      issuerCode:product.approval_issuer||product.issuer,
      answers:inputAnswers,
      config:runtime.approval
    });
    const longTerm=longTermEngine.evaluate({cardKey:productId,answers:inputAnswers,config:runtime.longTerm});
    const output=orchestrator.evaluate({
      bank,
      approval,
      longTerm,
      timing,
      config:runtime.orchestrator,
      missingFactInfo:runtime.reportTemplates.missing_fact_info,
      finalTemplates:runtime.reportTemplates.final_templates,
      systemKnowledgeStatus:bank.systemKnowledgeStatus
    });
    const report=reportRenderer.render({
      cardKey:productId,
      cardName:card.name,
      answers:inputAnswers,
      facts,
      questions:((runtime.questions&&runtime.questions.cards)||{})[productId]||{},
      bank,
      approval,
      longTerm,
      output,
      timing,
      templates:runtime.reportTemplates,
      annualFee:longTermConfig.annual_fee
    });

    return{
      cardKey:productId,
      card,
      answers:inputAnswers,
      evaluationDate,
      assessmentDate:evaluationDate,
      provenance:provenance(runtime,evaluationDate),
      approval,
      bank,
      longTerm,
      output,
      incomplete:false,
      report
    };
  }

  return{evaluate,provenance,version:'assessment-core-1'};
});
