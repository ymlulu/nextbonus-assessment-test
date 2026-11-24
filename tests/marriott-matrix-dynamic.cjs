const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {createMatrix,parseHistories}=require('../engines/marriott-matrix-v1.js');
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const offer=require('../adapters/amex-offer-context-v1.js');
const decision=require('../engines/amex-decision-v1.js');
const m=data('marriott-eligibility-matrix.json'),matrix=createMatrix(m);
const ruleIndex=data('dynamic-questionnaire-rule-index.json');
const policy=data('amex-questionnaire-policy.json');
const planner=makePlanner({ruleIndex,products:data('products.json'),
 baseQuestions:data('questions.json').common,frozenOfferFacts:data('frozen-offer-facts.json')});
const facade=createFacade({planner,lookup:createLookup(data('card-identity-index.json')),
 amexEnricher:createEnricher({policy}),amexOfferContext:offer,
 amexDecision:decision,amexPolicy:policy,approvalConfig:data('approval-config.json'),
 marriottMatrix:matrix,ruleIndex,targetState});
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,
 approved_revolving_5d:'NO',same_product_applied_or_approved_90d:'NO'},
 F03_CARD_HISTORY:['NONE'],F08_RELATIONSHIP:'YES',F10_ISSUER_PORTFOLIO_COUNT:0};
const product=n=>({issuer:'AMEX',product_name:n,product_id:'qa',product_type:'CREDIT_CARD'});
const bevy='Marriott Bonvoy Bevy',brilliant='Marriott Bonvoy Brilliant',
 biz='Marriott Bonvoy Business American Express';
function qa(name,facts={},options={}){
 const inputs={input:name,known_facts:{...base,...facts},...options};
 let result=facade.plan(inputs);
 if(result.questionnaire)return result;
 const raw=data('amex-formal-product-identities.json').products.find(p=>p.display_name===name);
 if(raw)return facade.plan({...inputs,confirm_product_id:raw.assessment_product_id});
 return result;
}
const targetNames=[bevy,brilliant,biz];
assert.equal(m.prior_products.length,8);
assert.equal(m.targets.length,5);
for(const row of m.prior_products)for(const target of m.targets)
 assert.ok(row.cells[target.id],'all 40 source matrix cells retained');
for(const target of targetNames){
 const empty=matrix.evaluate({product:product(target),known_facts:{F07_MARRIOTT_HISTORY:['NONE']}});
 assert.equal(empty.status,'CLEAR','no related card history => clear');
 assert.equal(empty.questions.length,0);
 const missing=matrix.evaluate({product:product(target),known_facts:{}});
 assert.equal(missing.status,'MISSING');
 assert.equal(missing.questions.length,1,'only one initial history question');
 assert.ok(missing.questions[0].options.every(o=>o.label),'valid options for '+target);
 const prior=m.prior_products.filter(r=>r.cells[target]==='OK');
 for(const irrelevant of prior){
  const candidate=matrix.evaluate({product:product(target),known_facts:{F07_MARRIOTT_HISTORY:[irrelevant.label]}});
  // History labels from the canonical public questionnaire, not all source row labels,
  // may differ. An unsupported label must never be treated as a negative.
  if(candidate.status==='MISSING')continue;
  assert.equal(candidate.status,'CLEAR','irrelevant historical card does not create follow-ups');
  assert.equal(candidate.questions.length,0);
 }
}
const ritz='Chase Ritz-Carlton',bold='Chase Marriott Bonvoy Bold / Boundless',
   bountiful='Chase Marriott Bonvoy Bountiful';
let r=qa('Marriott Bonvoy Business Card',{F07_MARRIOTT_HISTORY:[ritz]});
assert.equal(r.marriott_matrix.status,'CLEAR','Ritz cannot block Marriott Business');
assert.equal(r.questionnaire.questionnaire.specific.some(q=>q.type==='structured_marriott'),false);
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz]});
assert.equal(r.marriott_matrix.status,'MISSING');
let questions=r.questionnaire.questionnaire.specific.filter(q=>q.type==='structured_marriott');
assert.equal(questions.length,1);
assert.deepEqual(questions[0].fields.map(x=>x.id),['held_now']);
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'YES'}}});
assert.equal(r.marriott_matrix.status,'TRIGGERED');
assert.equal(r.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(r.evaluation.bonus.triggered_rules.includes('MARRIOTT-MATRIX:chase_ritz_carlton'));
assert.equal(r.questionnaire.questionnaire.specific.filter(q=>q.type==='structured_marriott').length,0,
 'no more user questions once decisive block found');
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'NO'}}});
assert.deepEqual(r.questionnaire.questionnaire.specific.filter(q=>q.type==='structured_marriott')[0]
 .fields.map(x=>x.id),['closed_within_30d'],'ask 30d date only after not currently held');
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'NO',closed_within_30d:'NO'}}});
assert.equal(r.marriott_matrix.status,'CLEAR');
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:[bold]});
assert.equal(r.marriott_matrix.status,'MISSING');
const details=r.questionnaire.questionnaire.specific.find(q=>q.type==='structured_marriott');
assert.deepEqual(details.fields.map(x=>x.id),['approved_within_90d','bonus_or_upgrade_within_24m']);
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:[bold],
 F07_MARRIOTT_DETAILS:{chase_bold_boundless:{approved_within_90d:'YES'}}});
assert.equal(r.marriott_matrix.status,'TRIGGERED');
assert.equal(r.questionnaire.questionnaire.specific.filter(q=>q.type==='structured_marriott').length,0,
 'one confirmed matrix trigger suppresses unrelated questions');
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:[bold],
 F07_MARRIOTT_DETAILS:{chase_bold_boundless:{approved_within_90d:'NO'}}});
assert.deepEqual(r.questionnaire.questionnaire.specific.find(q=>q.type==='structured_marriott')
 .fields.map(x=>x.id),['bonus_or_upgrade_within_24m']);
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:[bold],
 F07_MARRIOTT_DETAILS:{chase_bold_boundless:{
 approved_within_90d:'NO',bonus_or_upgrade_within_24m:'NO'}}});
assert.equal(r.marriott_matrix.status,'CLEAR');
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:[ritz],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'YES'}}},
 {offer_variant:'NLL'});
assert.equal(r.evaluation.bonus.status,'LIKELY_RESTRICTED',
 'NLL does not bypass independent Marriott cross-issuer 30d rule');
r=qa('Marriott Bonvoy Brilliant Card',{F07_MARRIOTT_HISTORY:['AMEX Marriott Bonvoy Bevy']});
assert.equal(r.marriott_matrix.status,'CLEAR','Bevy does not restrict Brilliant after 2026 reversal');
assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND');
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:['AMEX Marriott Bonvoy Brilliant'],
 F03_CARD_HISTORY:['Marriott Bonvoy Brilliant']});
assert.equal(r.marriott_matrix.status,'CLEAR','LL family belongs to separate rule, not matrix');
assert.ok(r.evaluation.bonus.triggered_rules.includes('AMEX-FL-012'),
 'Brilliant history triggers standard Bevy family clause');
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz,bountiful],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'YES'}}});
assert.equal(r.marriott_matrix.status,'TRIGGERED');
assert.equal(r.questionnaire.questionnaire.specific.filter(q=>q.type==='structured_marriott').length,0,
 'do not ask Bountiful dates after Ritz is an established blocker');
r=qa('Marriott Bonvoy Bevy Card',{});
assert.equal(r.marriott_matrix.status,'MISSING');
assert.equal(r.questionnaire.questionnaire.specific.filter(q=>q.id==='F07_MARRIOTT_HISTORY').length,1,
 'only one grouped history question, not per rule');
// Family and cross-issuer facts share a single F03 question, including
// old SPG product variants even when the same-product clause is also active.
for(const [card,expected] of [
 ['Marriott Bonvoy Bevy Card','Marriott Bonvoy Brilliant'],
 ['Marriott Bonvoy Brilliant Card','以前的 SPG Luxury'],
 ['Marriott Bonvoy Business Card','以前的 SPG Business']
]){
 const original=qa(card,{});
 const f03=original.questionnaire.questionnaire.specific.find(q=>q.id==='F03_CARD_HISTORY');
 assert.ok(f03,'F03 included for '+card);
 assert.ok(f03.options.some(o=>o.value===expected),
   'family-specific holding option '+expected+' must not be lost to de-duplication');
 assert.equal(original.questionnaire.questionnaire.specific.filter(q=>q.id==='F03_CARD_HISTORY').length,1);
}
// Reuse confirmed holdings across F07 (cross-bank) and F03 (Amex lifetime).
let crossKnown=qa('Marriott Bonvoy Bevy Card',{
 F07_MARRIOTT_HISTORY:['AMEX Marriott Bonvoy Brilliant'],
 F03_CARD_HISTORY:['NONE']
});
assert.equal(crossKnown.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(crossKnown.evaluation.bonus.triggered_rules.includes('AMEX-FL-012'));
assert.ok(!crossKnown.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'),
 'already-confirmed Brilliant holding needs no duplicate family-history question');
let previouslyBlocked=qa('Marriott Bonvoy Bevy Card',{
 F03_CARD_HISTORY:['Marriott Bonvoy Brilliant']
});
assert.equal(previouslyBlocked.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.equal(previouslyBlocked.marriott_matrix.status,'SKIPPED_AFTER_BONUS_BLOCK');
assert.ok(!previouslyBlocked.questionnaire.questionnaire.specific.some(q=>
 q.id==='F07_MARRIOTT_HISTORY'||q.type==='structured_marriott'),
 'confirmed family blocker means Marriott date questions cannot change outcome');
let legacyBiz=qa('Marriott Bonvoy Business Card',{
 F03_CARD_HISTORY:['NONE'],
 F07_MARRIOTT_HISTORY:['AMEX Marriott Bonvoy Business / Legacy SPG Business']
});
assert.equal(legacyBiz.evaluation.bonus.status,'LIKELY_RESTRICTED',
 'Business/legacy SPG group is itself enough to trigger current target family rule');
assert.ok(legacyBiz.evaluation.bonus.triggered_rules.includes('AMEX-BIZ-005'));
assert.equal(legacyBiz.questionnaire.questionnaire.specific.some(q=>q.type==='structured_marriott'),false);
const dummy=matrix.evaluate({product:product(bevy),
 known_facts:{F07_MARRIOTT_HISTORY:['some arbitrary historic card']}});
assert.equal(dummy.status,'MISSING','unknown holdings are not auto-cleared');
const secret='VERY_PRIVATE_CUSTOMER_ANSWER';
r=qa('Marriott Bonvoy Bevy Card',{F07_MARRIOTT_HISTORY:[ritz],
 F07_MARRIOTT_DETAILS:{chase_ritz_carlton:{held_now:'NO',closed_within_30d:secret}}});
assert.equal(r.marriott_matrix.status,'MISSING');
assert.ok(!JSON.stringify(r.evaluation).includes(secret),
 'private answers not echoed to user-visible report');
for(const f of ['engines/marriott-matrix-v1.js','engines/amex-decision-v1.js']){
 const s=fs.readFileSync(path.join(root,f),'utf8');
 assert.doesNotMatch(s,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
}
console.log(JSON.stringify({suite:'marriott-dynamic-followups',
 cells:40,amExTargets:3,onlyNeededFacts:true,shortCircuit:true,
 nllDoesNotEraseMatrix:true,privacy:true,status:'PASS'}));
