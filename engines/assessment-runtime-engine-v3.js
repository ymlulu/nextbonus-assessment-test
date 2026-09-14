(function(){'use strict';
function browserEngines(){return{factNormalizer:FactNormalizerV3,bankRule:BankRuleEngine,approval:ApprovalEngineV2,longTerm:LongTermEngineV2,orchestrator:OrchestratorEngineV2,reportRenderer:ReportRendererV2}}
function evaluate(cardKey,answers,context){
  const runtime=window.NBRuntime,config=window.NB_CONFIG,evaluationDate=context&&context.evaluationDate;
  return AssessmentCoreV1.evaluate({productId:cardKey,answers,runtime,cards:config&&config.cards,evaluationDate,engines:browserEngines()});
}
function provenance(runtime,evaluationDate){return AssessmentCoreV1.provenance(runtime,evaluationDate)}
window.AssessmentRuntimeEngineV3={evaluate,provenance,version:'assessment-runtime-3.4',coreVersion:AssessmentCoreV1.version};
})();
