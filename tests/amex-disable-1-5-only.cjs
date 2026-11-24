const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const amexOfferContext=require('../adapters/amex-offer-context-v1.js');
const amexDecision=require('../engines/amex-decision-v1.js');
const {createMatrix}=require('../engines/marriott-matrix-v1.js');
const index=read('dynamic-questionnaire-rule-index.json');
const policy=read('amex-questionnaire-policy.json');
const amexRules=index.rules.filter(r=>r.id.startsWith('AMEX'));
assert.equal(amexRules.length,31,'preserve original 31-rule provenance');
assert.equal(amexRules.filter(r=>r.runtime_class==='EXECUTABLE_RULE').length,22);
const disabled=index.rules.find(r=>r.id==='AMEX-010');
const retained=index.rules.find(r=>r.id==='AMEX-006');
assert.equal(disabled.runtime_class,'INACTIVE');
assert.equal(disabled.status,'INACTIVE');
assert.equal(disabled.question_eligible,'NO');
assert.equal(retained.runtime_class,'EXECUTABLE_RULE');
assert.equal(retained.status,'ACTIVE');
assert.equal(policy.question_templates.F02_ISSUER_APPLICATION_HISTORY.fields.length,2);
assert.ok(!policy.question_templates.F02_ISSUER_APPLICATION_HISTORY.fields.some(
 f=>f.id==='approved_revolving_5d'));
const facade=createFacade({
 planner:makePlanner({ruleIndex:index,products:read('products.json'),
  baseQuestions:read('questions.json').common,
  frozenOfferFacts:read('frozen-offer-facts.json')}),
 lookup:createLookup(read('card-identity-index.json')),
 amexEnricher:createEnricher({policy}),
 amexOfferContext,amexDecision,amexPolicy:policy,ruleIndex:index,targetState,
 approvalConfig:read('approval-config.json'),
 marriottMatrix:createMatrix(read('marriott-eligibility-matrix.json'))
});
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,
  same_product_applied_or_approved_90d:'NO'},
 F03_CARD_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],
 F10_ISSUER_PORTFOLIO_COUNT:0,F08_RELATIONSHIP:'YES'};
function evaluate(id,facts=base){return facade.plan({product_id:id,known_facts:facts});}
const cards=read('amex-formal-product-identities.json').products;
assert.equal(cards.length,32);
for(const card of cards){
 const r=evaluate(card.assessment_product_id);
 assert.ok(r.questionnaire,'every formal Amex card must remain accessible');
 assert.ok(!r.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-010'));
 assert.ok(!r.evaluation.rule_results.some(v=>v.rule_id==='AMEX-010'));
 assert.ok(!r.evaluation.application.missing_rules.includes('AMEX-010'));
 assert.ok(!r.evaluation.application.unresolved_rules.some(v=>v.rule_id==='AMEX-010'));
 if(card.card_form==='REVOLVING_CREDIT'){
  assert.ok(r.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-006'),
   '2/90 must remain active for '+card.nb_card_id);
 }
}
const target='amex_delta_gold';
const withNo5d=evaluate(target).evaluation;
const with5d=evaluate(target,{...base,F02_ISSUER_APPLICATION_HISTORY:{
 ...base.F02_ISSUER_APPLICATION_HISTORY,approved_revolving_5d:'YES'}}).evaluation;
assert.deepEqual(with5d,withNo5d,'retired 1/5 fact must have zero impact on results');
const noRecent=evaluate(target).evaluation;
const twice=evaluate(target,{...base,F02_ISSUER_APPLICATION_HISTORY:{
 ...base.F02_ISSUER_APPLICATION_HISTORY,approved_revolving_90d:2}}).evaluation;
assert.equal(noRecent.application.status,'MODEL_ONLY');
assert.equal(twice.application.status,'ELEVATED_RISK');
assert.ok(twice.application.triggered_rules.includes('AMEX-006'));
assert.ok(!twice.application.triggered_rules.includes('AMEX-010'));
const unanswered=evaluate(target,{...base,F02_ISSUER_APPLICATION_HISTORY:{
 same_product_applied_or_approved_90d:'NO'}});
assert.ok(unanswered.evaluation.application.missing_rules.includes('AMEX-006'),
 '2/90 missing input continues to require user answer');
assert.ok(!unanswered.evaluation.application.missing_rules.includes('AMEX-010'));
const pendingQuestion=unanswered.questionnaire.questionnaire.specific.find(
 q=>q.id==='F02_ISSUER_APPLICATION_HISTORY');
assert.ok(pendingQuestion,'question still asks missing 2/90 fact');
assert.deepEqual(pendingQuestion.fields.map(x=>x.id),['approved_revolving_90d']);
for(const file of ['adapters/amex-questionnaire-v1.js',
 'adapters/dynamic-questionnaire-v1.js','engines/amex-decision-v1.js',
 'assets/dynamic-questionnaire-demo.js']){
 const code=fs.readFileSync(path.join(root,file),'utf8');
 assert.ok(!code.includes('approved_revolving_5d'),
  'retired 5-day fact must not be referenced by runtime: '+file);
}
assert.equal(policy.source.rule_ids.includes('AMEX-006'),true);
assert.equal(policy.source.rule_ids.includes('AMEX-010'),true,
 'source audit inventory keeps the ID, disabled at runtime');
console.log(JSON.stringify({suite:'retire-amex-1-5-only',
 ruleRecords:31,activeRuleDefinitions:22,
 twoNinetyRetained:true,oneFiveFullyDisabled:true,formalProducts:32,status:'PASS'}));
