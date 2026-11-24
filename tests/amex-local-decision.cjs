const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const amexContext=require('../adapters/amex-offer-context-v1.js');
const decision=require('../engines/amex-decision-v1.js');
const {createMatrix}=require('../engines/marriott-matrix-v1.js');
const idx=data('dynamic-questionnaire-rule-index.json');
const policy=data('amex-questionnaire-policy.json');
const identity=data('amex-formal-product-identities.json');
const lookup=createLookup(data('card-identity-index.json'));
const planner=makePlanner({ruleIndex:idx,products:data('products.json'),
 baseQuestions:data('questions.json').common,frozenOfferFacts:data('frozen-offer-facts.json')});
const facade=createFacade({planner,lookup,
  amexEnricher:createEnricher({policy}),amexOfferContext:amexContext,
  ruleIndex:idx,targetState,amexDecision:decision,amexPolicy:policy,
  approvalConfig:data('approval-config.json'),
  marriottMatrix:createMatrix(data('marriott-eligibility-matrix.json'))});
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0'};
const clean={...base,
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,
   approved_revolving_5d:'NO',same_product_applied_or_approved_90d:'NO'},
 F03_CARD_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],
 F08_RELATIONSHIP:'YES',F10_ISSUER_PORTFOLIO_COUNT:0};
function call(input,known_facts=clean,opts={}){
 let result=facade.plan({input,known_facts,...opts});
 if(result.questionnaire)return result;
 const x=identity.products.find(p=>p.display_name===input);
 if(x)return facade.plan({input,confirm_product_id:x.assessment_product_id,known_facts,...opts});
 return result;
}
const active=idx.rules.filter(x=>x.id.startsWith('AMEX')&&x.runtime_class==='EXECUTABLE_RULE');
assert.equal(active.length,23);
const executable=new Set([...active].map(x=>x.id));
assert.equal(executable.size,23);
assert.equal(identity.products.length,32);
for(const card of identity.products){
 const o=call(card.display_name);
 assert.ok(o.evaluation,'local evaluation for '+card.nb_card_id);
 assert.equal(o.evaluation.review_only,true);
 assert.equal(o.evaluation.benefits_included,false);
 assert.equal(o.evaluation.answers_transmitted,false);
 assert.equal(o.evaluation.application.base_risk,'HIGH');
 assert.equal(o.evaluation.bonus.status,'NO_TRIGGER_FOUND',
   'none-held standard offer cannot have a bonus trigger: '+card.nb_card_id);
 assert.equal(o.evaluation.application.status,'MODEL_ONLY',
   'clear history across all 32 should be model-only: '+card.nb_card_id);
 const ids=o.evaluation.rule_results.map(x=>x.rule_id);
 assert.equal(new Set(ids).size,ids.length,'rule ID deduplication');
 assert.ok(ids.every(x=>executable.has(x)),'no reference/meta rule execution');
 const wrongCategory=o.evaluation.rule_results.find(x=>
   card.card_form==='CHARGE_OR_PAY_OVER_TIME'&&
   ['AMEX-006','AMEX-007','AMEX-010'].includes(x.rule_id));
 assert.ok(!wrongCategory,'charge must never run revolving rules');
 const q=o.questionnaire.questionnaire;
 assert.equal(q.benefits,null);
 assert.ok(!q.specific.some(x=>x.id==='F02_ISSUER_APPLICATION_HISTORY'),
   'all requisite structured activity answers already supplied');
}
const gold='American Express Gold Card';
let r=call(gold,{...clean,F03_CARD_HISTORY:['The Platinum Card']});
assert.equal(r.evaluation.application.status,'MODEL_ONLY',
  'bonus restriction must not automatically lower application approval');
assert.equal(r.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(r.evaluation.bonus.triggered_rules.includes('AMEX-FL-004'));
let nll=call(gold,{...clean,F03_CARD_HISTORY:['Personal AMEX Gold']},
 {offer_variant:'NLL'});
assert.equal(nll.evaluation.bonus.status,'LIKELY_RESTRICTED',
  'NLL removes target lifetime but not independent Gold family restriction');
assert.ok(!nll.evaluation.rule_results.some(x=>x.rule_id==='AMEX-001'));
const fullyNll=call(gold,{...clean,F03_CARD_HISTORY:['Personal AMEX Gold']},
 {offer_variant:'NLL',offer_rule_overrides:{'AMEX-FL-004':'ABSENT'}});
assert.equal(fullyNll.evaluation.bonus.status,'NO_TRIGGER_FOUND');

r=call('Blue Cash Preferred Card',{...clean,F03_CARD_HISTORY:['Blue Cash Preferred']});
assert.equal(r.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(r.evaluation.bonus.triggered_rules.includes('AMEX-001'));
r=call('Blue Cash Preferred Card',{...clean,F03_CARD_HISTORY:['NONE']});
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');

r=call('Delta SkyMiles Gold Card',{...clean,F03_CARD_HISTORY:['Delta SkyMiles Reserve (Personal)']});
assert.ok(r.evaluation.bonus.triggered_rules.includes('AMEX-FL-008'));
r=call('Delta SkyMiles Reserve Business Card',{...clean,F03_CARD_HISTORY:['Delta SkyMiles Reserve (Personal)']});
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND',
 'business Delta must not inherit personal Delta family restriction');

r=call('Hilton Honors Surpass Card',{...clean,F03_CARD_HISTORY:['Hilton Aspire (Personal)']});
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND',
 'no inferred Hilton cross-tier restriction');
r=call('Marriott Bonvoy Business Card',{...clean,
 F07_MARRIOTT_HISTORY:['Chase Ritz-Carlton']});
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND',
 'source matrix makes Ritz-Carlton history irrelevant for AMEX Marriott Business');
assert.equal(r.marriott_matrix.status,'CLEAR');
r=call('Platinum Card exclusively for Morgan Stanley',{...clean,F08_RELATIONSHIP:'NO'});
assert.equal(r.evaluation.application.status,'ELEVATED_RISK');
assert.ok(r.evaluation.application.triggered_rules.includes('AMEX-REL-002'));
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');

r=call('Delta SkyMiles Gold Card',{...clean,F02_ISSUER_APPLICATION_HISTORY:{
 approved_revolving_90d:2,approved_revolving_5d:'YES',
 same_product_applied_or_approved_90d:'YES'}});
for(const id of ['AMEX-006','AMEX-010','AMEX-011'])
 assert.ok(r.evaluation.application.triggered_rules.includes(id),id+' triggered');
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');

r=call('Blue Cash Everyday Card',{...clean,F10_ISSUER_PORTFOLIO_COUNT:5});
assert.ok(r.evaluation.application.triggered_rules.includes('AMEX-007'));
r=call(gold,{...clean,F10_ISSUER_PORTFOLIO_COUNT:10});
assert.ok(r.evaluation.application.triggered_rules.includes('AMEX-008'));

r=call(gold,{...clean,F03_CARD_HISTORY:undefined});
assert.equal(r.evaluation.bonus.status,'NEEDS_REVIEW');
assert.ok(r.evaluation.bonus.missing_rules.includes('AMEX-001'));
r=call('Delta SkyMiles Gold Card',{...clean,
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:1}});
assert.equal(r.evaluation.application.status,'INSUFFICIENT_DATA');
assert.ok(r.questionnaire.questionnaire.specific.some(x=>
 x.id==='F02_ISSUER_APPLICATION_HISTORY'));
r=call(gold,{...clean,F02_ISSUER_APPLICATION_HISTORY:{
 same_product_applied_or_approved_90d:'NO'}});
assert.ok(!r.questionnaire.questionnaire.specific.some(x=>x.id==='F02_ISSUER_APPLICATION_HISTORY'),
 'charge-card F02 needs same-product only');
r=call('Blue Cash Everyday Card',{...clean,a2:'UNKNOWN'});
assert.equal(r.evaluation.application.base_risk,'INSUFFICIENT_DATA');
const secret='PRIVATE_CREDIT_FACT_DO_NOT_ECHO';
r=call(gold,{...clean,F03_CARD_HISTORY:[secret]});
assert.ok(!JSON.stringify(r.evaluation).includes(secret),
 'personal answer values must not echo into the decision report');
for(const p of ['engines/amex-decision-v1.js','adapters/card-questionnaire-facade-v1.js']){
 const content=fs.readFileSync(path.join(root,p),'utf8');
 assert.doesNotMatch(content,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
}
const demo=fs.readFileSync(path.join(root,'assets/dynamic-questionnaire-demo.js'),'utf8');
assert.match(demo,/assessment-result/);
assert.match(demo,/item\.type==='structured'/);
console.log(JSON.stringify({suite:'amex-local-rule-evaluation',
 formalAmexCards:32,rules:23,approvalSeparated:true,bonusSeparated:true,
 standardAndNLL:true,structuredInput:true,private:true,status:'PASS'}));
