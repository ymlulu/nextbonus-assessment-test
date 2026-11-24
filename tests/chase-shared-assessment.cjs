const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher:amexEnricher}=require('../adapters/amex-questionnaire-v1.js');
const {createEnricher:chaseEnricher}=require('../adapters/chase-questionnaire-v1.js');
const {createMatrix}=require('../engines/marriott-matrix-v1.js');
const index=data('dynamic-questionnaire-rule-index.json');
const chasePolicy=data('chase-questionnaire-policy.json');
const identity=data('card-identity-index.json');
const facade=createFacade({
 planner:makePlanner({ruleIndex:index,products:data('products.json'),
  baseQuestions:data('questions.json').common,
  frozenOfferFacts:data('frozen-offer-facts.json')}),
 lookup:createLookup(identity),ruleIndex:index,targetState,
 amexEnricher:amexEnricher({policy:data('amex-questionnaire-policy.json')}),
 amexOfferContext:require('../adapters/amex-offer-context-v1.js'),
 amexDecision:require('../engines/amex-decision-v1.js'),
 amexPolicy:data('amex-questionnaire-policy.json'),
 chaseEnricher:chaseEnricher({policy:chasePolicy}),
 chaseDecision:require('../engines/chase-decision-v1.js'),chasePolicy,
 approvalConfig:data('approval-config.json'),
 marriottMatrix:createMatrix(data('marriott-eligibility-matrix.json'))
});
const profile={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0'};
function check(id,other={}){return facade.plan({product_id:id,known_facts:{...profile,...other}});}
const chaseIndex=index.rules.filter(x=>x.id.startsWith('CHASE'));
assert.equal(chaseIndex.length,37);
assert.equal(chaseIndex.filter(x=>x.runtime_class==='EXECUTABLE_RULE').length,21);
assert.equal(Object.keys(chasePolicy.rule_checks).length,21);
const cards=identity.products.filter(x=>x.issuer==='CHASE');
assert.equal(cards.length,29);
for(const card of cards){
 const result=check(card.product_id);
 assert.ok(result.evaluation,'Chase assessment for '+card.product_id);
 assert.equal(result.evaluation.issuer,'CHASE');
 assert.equal(result.evaluation.review_only,true);
 assert.equal(result.evaluation.answers_transmitted,false);
 assert.equal(result.evaluation.benefits_included,false);
 assert.equal(result.evaluation.application.base_risk,'HIGH');
 assert.ok(!result.evaluation.rule_results.some(x=>x.rule_id==='AMEX-010'));
 assert.ok(result.evaluation.rule_results.every(x=>chasePolicy.rule_checks[x.rule_id]),
  'never execute reference, meta or unknown rules '+card.product_id);
 const ids=result.evaluation.rule_results.map(x=>x.rule_id);
 assert.equal(ids.length,new Set(ids).size);
}
// Review 5/24 and AU outcomes, never falsely clear a 5+ file if AU is unknown.
const id='chase_sapphire_preferred';
let r=check(id,{F01_RECENT_NEW_ACCOUNTS:5});
assert.ok(r.evaluation.application.missing_rules.includes('CHASE-001'));
assert.ok(r.questionnaire.questionnaire.specific.some(x=>x.id==='F06_AU_BREAKDOWN'));
r=check(id,{F01_RECENT_NEW_ACCOUNTS:5,F06_AU_BREAKDOWN:0});
assert.ok(r.evaluation.application.triggered_rules.includes('CHASE-001'));
assert.equal(r.evaluation.application.status,'ELEVATED_RISK');
r=check(id,{F01_RECENT_NEW_ACCOUNTS:5,F06_AU_BREAKDOWN:2});
assert.ok(r.evaluation.application.unresolved_rules.some(x=>
 x.rule_id==='CHASE-001'&&x.status==='REVIEW'));
assert.ok(!r.evaluation.application.triggered_rules.includes('CHASE-001'));
r=check(id,{F01_RECENT_NEW_ACCOUNTS:4});
assert.equal(r.evaluation.rule_results.find(x=>x.rule_id==='CHASE-001').status,'CLEAR');
assert.ok(!r.questionnaire.questionnaire.specific.some(x=>x.id==='F06_AU_BREAKDOWN'));
// 2/30 and same-target Sapphire eligibility remain independent.
r=check(id,{F01_RECENT_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{chase_approved_30d:2},
 F03_CARD_HISTORY:{current_target:'NO'},
 F04_BONUS_HISTORY:{bonus_target_ever:'NO'}});
assert.ok(r.evaluation.application.triggered_rules.includes('CHASE-002'));
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
r=check(id,{F01_RECENT_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{chase_approved_30d:0},
 F03_CARD_HISTORY:{current_target:'NO'},
 F04_BONUS_HISTORY:{bonus_target_ever:'YES'}});
assert.equal(r.evaluation.application.status,'MODEL_ONLY');
assert.ok(r.evaluation.bonus.triggered_rules.includes('CHASE-003'));
r=check(id,{F01_RECENT_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{chase_approved_30d:0},
 F03_CARD_HISTORY:{current_target:'YES'},
 F04_BONUS_HISTORY:{bonus_target_ever:'NO'}});
assert.ok(r.evaluation.application.triggered_rules.includes('CHASE-PROD-017'));
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
const csr=check('chase_sapphire_reserve',{
 F01_RECENT_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{chase_approved_30d:0},
 F03_CARD_HISTORY:{current_target:'NO'},
 F04_BONUS_HISTORY:{bonus_target_ever:'NO'}});
assert.ok(csr.evaluation.rule_results.some(x=>x.rule_id==='CHASE-PROD-018'));
assert.ok(!csr.evaluation.rule_results.some(x=>x.rule_id==='CHASE-PROD-017'));
// Freedom siblings do not automatically share exact-card restrictions.
r=check('history_ot_chase_038',{
 F01_RECENT_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{chase_approved_30d:0},
 F03_CARD_HISTORY:{current_target:'NO'},
 F04_BONUS_HISTORY:{bonus_target_24m:'NO'}});
assert.ok(r.evaluation.rule_results.some(x=>x.rule_id==='CHASE-PROD-011'));
assert.equal(r.evaluation.rule_results.find(x=>x.rule_id==='CHASE-PROD-011').status,'CLEAR');
// The same question and result contract drives Chase and Amex UIs.
const amex=check('amex_gold');
assert.equal(amex.evaluation.issuer,'AMEX');
assert.ok(amex.questionnaire);
assert.ok(amex.questionnaire.questionnaire.common.length<=4);
const sample=check('chase_sapphire_preferred');
const q=sample.questionnaire.questionnaire.specific;
assert.ok(q.some(x=>x.id==='F01_RECENT_NEW_ACCOUNTS'&&x.type==='number'));
assert.ok(q.some(x=>x.id==='F02_ISSUER_APPLICATION_HISTORY'&&x.type==='structured'));
assert.ok(q.some(x=>x.id==='F03_CARD_HISTORY'&&x.type==='structured'));
assert.ok(q.some(x=>x.id==='F04_BONUS_HISTORY'&&x.type==='structured'));
for(const file of ['adapters/chase-questionnaire-v1.js','engines/chase-decision-v1.js']){
 const code=fs.readFileSync(path.join(root,file),'utf8');
 assert.doesNotMatch(code,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
}
console.log(JSON.stringify({suite:'chase-shared-assessment-ui',
 chaseCards:29,chaseRules:21,bankRulesRecords:37,
 auReview:true,appBonusSeparate:true,ruleLabels:true,answersLocal:true,status:'PASS'}));
