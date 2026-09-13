const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),zlib=require('zlib');
const root=path.resolve(__dirname,'..');
const J=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const load=(ctx,p)=>{vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx);Object.assign(ctx,ctx.window)};
const mergeReport=(base,policy)=>({...base,...policy,rule_templates:{...(base.rule_templates||{}),...(policy.rule_templates||{})},rule_template_index:{...(base.rule_template_index||{}),...(policy.rule_template_index||{})},offer_display:{...(base.offer_display||{}),...(policy.offer_display||{})},long_term_templates:{...(base.long_term_templates||{}),...(policy.long_term_templates||{})}});
function runtime(){
 const x={window:{},console};vm.createContext(x);
 for(const f of ['engines/bank-rule-engine.js','engines/timing-engine.js','engines/fact-normalizer.js','engines/approval-engine.js','engines/long-term-engine.js','engines/orchestrator-engine.js','engines/report-renderer.js','engines/assessment-runtime-engine-v3.js'])load(x,f);
 const products=J('data/products.json'),longTerm=J('data/long-term.json'),timing=J('data/offer-timing.json'),cards={};
 for(const[id,p]of Object.entries(products.cards)){const lt=longTerm.cards[id];cards[id]={key:id,name:p.name,issuer:p.issuer,approvalIssuer:p.approval_issuer||p.issuer,sensitivity:p.sensitivity,annualFee:lt.annual_fee,article:p.article_url,applicationUrl:p.application_url,q7:lt.q7.map(v=>({id:v.id,label:v.label,annualValue:v.annual_value,short:v.short})),q8:lt.q8.map(v=>({id:v.id,label:v.label,short:v.short}))}}
 const reportTemplates=mergeReport(J('data/report-templates.json'),J('data/report-render-policy.json'));
 x.window.NB_CONFIG={snapshotDate:products.snapshot_date,engineVersion:'runtime-3',cards};x.NB_CONFIG=x.window.NB_CONFIG;
 x.window.NBRuntime={manifest:J('data/runtime-manifest.json'),rules:J('data/bank-rules.json'),predicates:J('data/bank-rule-predicates.json'),timing,approval:J('data/approval-config.json'),longTerm,orchestrator:J('data/orchestrator.json'),reportTemplates,questions:J('data/questions.json'),factMapping:J('data/fact-mapping.json'),products,frozenOfferFacts:J('data/frozen-offer-facts.json')};x.NBRuntime=x.window.NBRuntime;x.TimingAdapter.hydrate(cards,timing);return x;
}
function eq(actual,expected,label,run){assert.deepEqual(actual,expected,`${run} ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)}
const fixture=J('data/qa/fixed-profile-acceptance-manifest.json'),payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,fixture.artifact.path))).toString('utf8')),cases=payload.cases,x=runtime(),m=x.NBRuntime.manifest;
assert.ok(Number.isInteger(fixture.case_count)&&fixture.case_count>0,'fixture case_count must be positive');assert.equal(cases.length,fixture.case_count);assert.equal(payload.case_count,fixture.case_count);assert.equal(payload.evaluation_date,fixture.evaluation_date)
assert.throws(()=>x.AssessmentRuntimeEngineV3.evaluate(cases[0].product_id,cases[0].answers),/evaluationDate/i,'runtime must require explicit frozen evaluationDate');
let checked=0;
for(const c of cases){
 const r=x.AssessmentRuntimeEngineV3.evaluate(c.product_id,c.answers,{evaluationDate:c.evaluation_date});
 const r2=x.AssessmentRuntimeEngineV3.evaluate(c.product_id,c.answers,{evaluationDate:c.evaluation_date});
 eq(JSON.stringify(r),JSON.stringify(r2),'determinism',c.run_id);
 eq(r.evaluationDate,c.evaluation_date,'evaluationDate',c.run_id);eq(r.assessmentDate,c.evaluation_date,'assessmentDate',c.run_id);
 eq(r.provenance.release_id,m.release_id,'release_id',c.run_id);eq(r.provenance.evaluation_date,c.evaluation_date,'provenance.evaluation_date',c.run_id);
 eq(JSON.stringify(r.provenance.engine_versions),JSON.stringify(m.engine),'engine_versions',c.run_id);
 eq(r.provenance.source_lock.path,m.source_lock.path,'source_lock.path',c.run_id);eq(r.provenance.source_lock.git_blob_sha,m.source_lock.git_blob_sha,'source_lock.git_blob_sha',c.run_id);
 const e=c.expected;
 eq(r.bank.applicationImpact,e.applicationImpact,'applicationImpact',c.run_id);eq(r.bank.applicationSoftImpact,e.applicationSoftImpact,'applicationSoftImpact',c.run_id);eq(r.bank.applicationHardBehavior,e.applicationHardBehavior,'applicationHardBehavior',c.run_id);
 eq(r.bank.bonusImpact,e.bonusImpact,'bonusImpact',c.run_id);eq(r.bank.bonusHardBehavior,e.bonusHardBehavior,'bonusHardBehavior',c.run_id);
 eq([...r.bank.triggeredRules].sort(),[...e.triggeredRules].sort(),'triggeredRules',c.run_id);
 eq(r.approval.baseApproval,e.baseApproval,'baseApproval',c.run_id);eq(r.output.approvalAfterSoftRules,e.approvalAfterSoftRules,'approvalAfterSoftRules',c.run_id);eq(r.output.adjustedApproval,e.adjustedApproval,'adjustedApproval',c.run_id);eq(r.output.approvalLabel,e.approvalLabel,'approvalLabel',c.run_id);
 eq(r.output.offerRating,e.offerRating,'offerRating',c.run_id);eq(r.card.timing.wait,e.waitRecommendation,'waitRecommendation',c.run_id);eq(r.output.bonusLabel,e.bonusLabel,'bonusLabel',c.run_id);eq(r.longTerm.label,e.longTermLabel,'longTermLabel',c.run_id);eq(r.output.internalState,e.internalState,'internalState',c.run_id);eq(r.output.recommendedAction,e.recommendedAction,'recommendedAction',c.run_id);
 assert.ok(Object.keys(r.provenance.runtime_contracts).length>=13,`${c.run_id} provenance missing runtime hashes`);
 checked++;
}
console.log(JSON.stringify({cases:checked,evaluationDate:fixture.evaluation_date,release:m.release_id,sourceLock:m.source_lock.git_blob_sha,status:'PASS'}));
