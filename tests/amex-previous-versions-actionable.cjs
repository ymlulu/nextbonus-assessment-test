const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const offers=require('../adapters/amex-offer-context-v1.js');
const decision=require('../engines/amex-decision-v1.js');
const {createMatrix}=require('../engines/marriott-matrix-v1.js');
const policy=data('amex-questionnaire-policy.json');
const ruleIndex=data('dynamic-questionnaire-rule-index.json');
const facade=createFacade({
 planner:makePlanner({ruleIndex,products:data('products.json'),
  baseQuestions:data('questions.json').common,frozenOfferFacts:data('frozen-offer-facts.json')}),
 lookup:createLookup(data('card-identity-index.json')),
 amexEnricher:createEnricher({policy}),amexOfferContext:offers,
 ruleIndex,targetState,amexDecision:decision,amexPolicy:policy,
 approvalConfig:data('approval-config.json'),
 marriottMatrix:createMatrix(data('marriott-eligibility-matrix.json'))
});
const baseline={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,
 approved_revolving_5d:'NO',same_product_applied_or_approved_90d:'NO'},
 F03_CARD_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],
 F08_RELATIONSHIP:'YES',F10_ISSUER_PORTFOLIO_COUNT:0};
function evalCard(productId,held,vars={}){
 return facade.plan({product_id:productId,known_facts:{...baseline,F03_CARD_HISTORY:held},...vars});
}
const genericLabels=['该系列的旧版本','该系列旧版本','这些产品的旧版本','该卡旧版本','该卡的旧版本'];
for(const [rid,scope] of Object.entries(policy.history_choices_by_rule)){
 assert.ok(!scope.some(x=>genericLabels.includes(x)),
  'no inert generic previous-version option in rule '+rid);
}
assert.ok(policy.legacy_variant_scope_by_rule['AMEX-FL-009'].includes('Delta SkyMiles Platinum (Personal)'));
assert.ok(policy.legacy_variant_scope_by_rule['AMEX-FL-009'].includes('Delta SkyMiles Reserve (Personal)'));
for(const [cardId,ruleId,holdings,notHoldings] of [
 ['history_ot_amex_004','AMEX-FL-009',['Delta SkyMiles Platinum (Personal)','Delta SkyMiles Reserve (Personal)'],'Delta SkyMiles Gold (Personal)'],
 ['amex_delta_gold','AMEX-FL-008',['Delta SkyMiles Gold (Personal)','Delta SkyMiles Platinum (Personal)','Delta SkyMiles Reserve (Personal)'],'Delta SkyMiles Blue (Personal)'],
 ['history_ot_amex_005','AMEX-FL-010',['Delta SkyMiles Reserve (Personal)'],'Delta SkyMiles Gold (Personal)']
]){
 const blank=evalCard(cardId,undefined);
 const q=blank.questionnaire.questionnaire.specific.find(x=>x.id==='F03_CARD_HISTORY');
 assert.ok(q,'must ask identifiable prior products '+cardId);
 assert.ok(q.options.some(x=>x.label.includes('（含同产品旧版本）')));
 assert.ok(!q.options.some(x=>genericLabels.some(p=>x.label.includes(p))));
 for(const holding of holdings){
  const option=q.options.find(x=>x.value===holding);
  assert.ok(option,'option present '+holding);
  assert.match(option.label,/含同产品旧版本/);
  const previous=evalCard(cardId,undefined).evaluation;
  const selected=evalCard(cardId,[holding]).evaluation;
  assert.equal(selected.bonus.status,'LIKELY_RESTRICTED');
  assert.ok(selected.bonus.triggered_rules.includes(ruleId),
   'selected named old-version-inclusive card triggers '+ruleId);
  assert.notEqual(previous.bonus.status,selected.bonus.status,
   'named old-version-inclusive selection changes bonus result');
 }
 const outside=evalCard(cardId,[notHoldings]).evaluation;
 assert.ok(!outside.bonus.triggered_rules.includes(ruleId),
  'unrelated lower-tier holding must not trigger family '+ruleId);
}
const blue=evalCard('history_ot_amex_036',undefined);
assert.ok(blue.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'&&
 q.options.some(v=>v.value==='Blue Cash Preferred'&&v.label.includes('含同产品旧版本'))));
const spg=evalCard('history_ot_amex_092',undefined);
assert.ok(spg.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'&&
 q.options.some(v=>v.value==='以前的 SPG Business'&&v.label.includes('SPG Business'))),
 'named predecessor stays independently selectable');
const spgHeld=evalCard('history_ot_amex_092',['以前的 SPG Business']);
assert.equal(spgHeld.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(spgHeld.evaluation.bonus.triggered_rules.includes('AMEX-BIZ-005'),
 'named historical SPG Business predecessor must change reward eligibility');
const spgLuxHeld=evalCard('amex_marriott_bonvoy_brilliant',['以前的 SPG Luxury']);
assert.equal(spgLuxHeld.evaluation.bonus.status,'LIKELY_RESTRICTED');
assert.ok(spgLuxHeld.evaluation.bonus.triggered_rules.includes('AMEX-FL-013'),
 'named historical SPG Luxury predecessor must change reward eligibility');
const noHoldings=evalCard('history_ot_amex_004',['NONE']);
assert.equal(noHoldings.evaluation.bonus.status,'NO_TRIGGER_FOUND');
assert.equal(noHoldings.evaluation.review_only,true);
assert.equal(noHoldings.evaluation.answers_transmitted,false);
console.log(JSON.stringify({suite:'actionable-amex-previous-versions',
 genericRemoved:10,deltaCases:3,namedLegacyRetained:true,answerAffectsOutcome:true,status:'PASS'}));
