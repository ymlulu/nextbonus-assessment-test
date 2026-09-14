const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const J=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const mergeReport=(base,policy)=>({...base,...policy,rule_templates:{...(base.rule_templates||{}),...(policy.rule_templates||{})},rule_template_index:{...(base.rule_template_index||{}),...(policy.rule_template_index||{})},offer_display:{...(base.offer_display||{}),...(policy.offer_display||{})},long_term_templates:{...(base.long_term_templates||{}),...(policy.long_term_templates||{})}});
const load=(ctx,p)=>{vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx);Object.assign(ctx,ctx.window)};

function build(){
  const ctx={window:{},console};vm.createContext(ctx);
  for(const file of ['engines/bank-rule-engine.js','engines/timing-engine.js','engines/fact-normalizer.js','engines/approval-engine.js','engines/long-term-engine.js','engines/orchestrator-engine.js','engines/report-renderer.js','engines/assessment-core-v1.js','engines/assessment-runtime-engine-v3.js'])load(ctx,file);
  const products=J('data/products.json'),longTerm=J('data/long-term.json'),timing=J('data/offer-timing.json'),cards={};
  for(const[id,p]of Object.entries(products.cards)){const lt=longTerm.cards[id];cards[id]={key:id,name:p.name,issuer:p.issuer,approvalIssuer:p.approval_issuer||p.issuer,sensitivity:p.sensitivity,annualFee:lt.annual_fee,article:p.article_url,applicationUrl:p.application_url,q7:(lt.q7||[]).map(v=>({id:v.id,label:v.label,annualValue:v.annual_value,short:v.short})),q8:(lt.q8||[]).map(v=>({id:v.id,label:v.label,short:v.short}))}}
  const reportTemplates=mergeReport(J('data/report-templates.json'),J('data/report-render-policy.json'));
  const runtime={manifest:J('data/runtime-manifest.json'),rules:J('data/bank-rules.json'),predicates:J('data/bank-rule-predicates.json'),timing,approval:J('data/approval-config.json'),longTerm,orchestrator:J('data/orchestrator.json'),reportTemplates,questions:J('data/questions.json'),factMapping:J('data/fact-mapping.json'),products,frozenOfferFacts:J('data/frozen-offer-facts.json')};
  ctx.window.NB_CONFIG={snapshotDate:products.snapshot_date,engineVersion:'runtime-3',cards};ctx.NB_CONFIG=ctx.window.NB_CONFIG;ctx.window.NBRuntime=runtime;ctx.NBRuntime=runtime;ctx.TimingAdapter.hydrate(cards,timing);
  const engines={factNormalizer:ctx.FactNormalizerV3,bankRule:ctx.BankRuleEngine,approval:ctx.ApprovalEngineV2,longTerm:ctx.LongTermEngineV2,orchestrator:ctx.OrchestratorEngineV2,reportRenderer:ctx.ReportRendererV2};
  return{ctx,runtime,cards,engines};
}

const api=require('../adapters/assessment-api-v1.js'),{ctx,runtime,cards,engines}=build(),productId='chase_sapphire_reserve',evaluationDate='2026-09-12';
assert.equal(api.contractVersion,'1');
const version=api.getVersion({runtime});assert.equal(version.contract_version,'1');assert.equal(version.release_id,runtime.manifest.release_id);assert.ok(version.source_lock);
const questionnaire=api.getProductAssessment({productId,runtime,locale:'zh-CN'});assert.equal(questionnaire.product.product_id,productId);assert.equal(questionnaire.contract_version,'1');assert.equal(questionnaire.questionnaire.common.length,4);assert.ok(questionnaire.questionnaire.specific.q5);assert.ok(questionnaire.questionnaire.specific.q6);assert.ok(questionnaire.questionnaire.benefits.q7.options.length>0);assert.ok(questionnaire.questionnaire.benefits.q8.options.length>0);
const flat={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',Q5A:'N0_3',Q5B:'NO',Q6A:'N0',Q6B:'NEVER',Q6C:'NO',q7:['CSR_Q7_TRAVEL'],q8:['CSR_Q8_REWARDS']};
const request={product_id:productId,evaluation_date:evaluationDate,locale:'zh-CN',answers:flat};
const response=api.evaluate({request,runtime,cards,engines});
assert.equal(response.contract_version,'1');assert.equal(response.release_id,runtime.manifest.release_id);assert.equal(response.product_id,productId);assert.equal(response.evaluation_date,evaluationDate);assert.ok(response.decision.recommended_action);assert.ok(response.report.offer_text);assert.equal(response.provenance.release_id,runtime.manifest.release_id);
const internal=api.toInternalAnswers(productId,flat,runtime),legacy=ctx.AssessmentRuntimeEngineV3.evaluate(productId,internal,{evaluationDate}),core=ctx.AssessmentCoreV1.evaluate({productId,answers:internal,runtime,cards,evaluationDate,engines});
assert.equal(JSON.stringify(legacy),JSON.stringify(core),'browser compatibility adapter must preserve Core output');
assert.equal(response.decision.internal_state,legacy.output.internalState);assert.equal(response.decision.recommended_action,legacy.output.recommendedAction);assert.equal(response.dimensions.application.approval,legacy.output.adjustedApproval);assert.equal(response.dimensions.bonus.status,legacy.output.bonusStatus);assert.equal(response.dimensions.offer.rating,legacy.output.offerRating);assert.equal(response.dimensions.long_term.label,legacy.longTerm.label);assert.equal(response.report.application_text,legacy.report.applicationText);assert.equal(response.report.long_term_text,legacy.report.longText);
assert.throws(()=>api.evaluate({request:{...request,evaluation_date:null},runtime,cards,engines}),e=>e.code==='INVALID_EVALUATION_DATE');assert.throws(()=>api.getProductAssessment({productId:'missing',runtime}),e=>e.code==='UNKNOWN_PRODUCT');
console.log(JSON.stringify({contractVersion:api.contractVersion,product:productId,release:runtime.manifest.release_id,browserCoreParity:true,status:'PASS'}));
