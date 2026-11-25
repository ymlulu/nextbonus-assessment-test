const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const offerContext=require('../adapters/amex-offer-context-v1.js');
const index=read('dynamic-questionnaire-rule-index.json');
const catalog=read('card-identity-index.json');
const lookup=createLookup(catalog);
const planner=makePlanner({ruleIndex:index,products:read('products.json'),
  baseQuestions:read('questions.json').common,frozenOfferFacts:read('frozen-offer-facts.json')});
const facade=createFacade({planner,lookup,
  amexEnricher:createEnricher({policy:read('amex-questionnaire-policy.json')}),
  amexOfferContext:offerContext,ruleIndex:index,targetState});
const amex=read('amex-formal-product-identities.json').products;
const get=(input,options={})=>{
  const match=facade.plan({input,...options});
  if(match.questionnaire)return match;
  if(match.status==='AMBIGUOUS'||match.status==='NEEDS_CONFIRMATION'){
    const f=amex.find(f=>f.display_name===input);
    if(f)return facade.plan({input,confirm_product_id:f.assessment_product_id,...options});
  }
  return match;
};
assert.equal(amex.length,32);
for(const f of amex){
  const standard=get(f.display_name);
  assert.ok(standard.questionnaire,'standard plan for '+f.nb_card_id);
  assert.equal(standard.offer_context.variant,'STANDARD');
  assert.equal(standard.offer_context.assumption,'UNVERIFIED_STANDARD_OFFER_MODEL');
  assert.equal(standard.limitations.offer_terms_verified,false);
  assert.equal(standard.questionnaire.evaluation_ready,false);
  assert.equal(standard.questionnaire.questionnaire.benefits,null);
  assert.ok(standard.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-001'),
    'standard offer applies same-card holding history '+f.nb_card_id);
  assert.ok(standard.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'),
    'standard offer asks prior holdings for '+f.nb_card_id);
  assert.ok(!standard.questionnaire.questionnaire.pending_terms.some(q=>q.rule_id==='AMEX-001'),
    'standard offer no longer blocks on unverified same-product gate');
  const nll=get(f.display_name,{offer_variant:'NLL'});
  assert.ok(nll.questionnaire);
  assert.ok(!nll.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-001'),
    'NLL suppresses same-product lifetime clause '+f.nb_card_id);
  assert.equal(nll.offer_context.variant,'NLL');
  assert.equal(nll.offer_context.assumption,'UNVERIFIED_STANDARD_OFFER_MODEL');
  assert.equal(nll.questionnaire.evaluation_ready,false);
}
const amexGold='American Express Gold Card';
const standardGold=get(amexGold);
const nllGold=get(amexGold,{offer_variant:'NLL'});
assert.ok(standardGold.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-004'));
assert.ok(nllGold.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-004'),
  'NLL does not automatically remove Family Rule');
assert.ok(nllGold.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'),
  'Gold NLL still checks family history');
const targetedGold=get(amexGold,{offer_variant:'NLL',offer_rule_overrides:{
  'AMEX-FL-004':'ABSENT'
}});
assert.ok(!targetedGold.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-004'));
assert.ok(!targetedGold.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'),
  'explicit absent family and same-product clauses remove holding question');
assert.deepEqual(targetedGold.offer_context.explicitly_overridden_rules,['AMEX-FL-004']);
const forcedGold=get(amexGold,{offer_variant:'NLL',offer_rule_overrides:{
  'AMEX-001':'PRESENT'
}});
assert.ok(forcedGold.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-001'),
  'explicit rule state overrides NLL assumption');
assert.throws(()=>get(amexGold,{offer_variant:'MAGIC'}),/INVALID_OFFER_VARIANT/);
assert.throws(()=>get(amexGold,{offer_variant:'NLL',
  offer_rule_overrides:{'AMEX-FL-001':'ABSENT'}}),/INVALID_OFFER_RULE_OVERRIDE/,
  'cannot modify clauses that do not apply to selected Amex product');
assert.throws(()=>get(amexGold,{offer_rule_overrides:{'CHASE-001':'ABSENT'}}),
  /INVALID_OFFER_RULE_OVERRIDE/);
assert.throws(()=>get(amexGold,{offer_rule_overrides:{'AMEX-FL-004':'MAYBE'}}),
  /INVALID_OFFER_RULE_OVERRIDE/);
const delta=get('Delta SkyMiles Gold Card');
assert.ok(delta.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-008'));
assert.ok(delta.questionnaire.questionnaire.specific.some(q=>
  q.id==='F03_CARD_HISTORY'&&q.options.some(o=>o.value==='Delta SkyMiles Reserve (Personal)')));
const deltaBiz=get('Delta SkyMiles Reserve Business Card');
assert.ok(!deltaBiz.questionnaire.diagnostics.applicable_rule_ids.some(id=>/^AMEX-FL-00(7|8|9|10)$/.test(id)),
  'Business Delta must not inherit Personal Delta family');
const hotel=get('Hilton Honors Surpass Card');
assert.ok(!hotel.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-011'),
  'Hilton meta is not a cross-tier veto');
const platinum=get('AMEX Platinum');
assert.ok(platinum.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-001'));
const platinumNll=get('AMEX Platinum',{offer_variant:'NLL'});
assert.ok(platinumNll.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-001'));
const amexRelationship=get('Platinum Card exclusively for Morgan Stanley');
assert.ok(amexRelationship.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-REL-002'));
const other=get('Chase Freedom Unlimited',{offer_variant:'NLL'});
assert.equal(other.offer_context,null,'AMEX override does not affect other issuers');
const secret='PRIVATE_USER_ANSWER_NEVER_SENT';
const sensitive=get(amexGold,{known_facts:{F03_CARD_HISTORY:secret}});
assert.ok(!JSON.stringify(sensitive).includes(secret));
assert.ok(!sensitive.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'));
for(const f of ['adapters/amex-offer-context-v1.js','adapters/card-questionnaire-facade-v1.js']){
  assert.doesNotMatch(fs.readFileSync(path.join(root,f),'utf8'),
    /localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
}
const page=fs.readFileSync(path.join(root,'dynamic-questionnaire.html'),'utf8');
assert.match(page,/id="offer-variant"/);
assert.match(page,/engines\/bank-rules-runtime\.js/);
assert.doesNotMatch(page,/adapters\/amex-offer-context-v1\.js/,'the live questionnaire must not load the retired per-issuer offer adapter');
console.log(JSON.stringify({suite:'amex-standard-offer-nll',
  formalAmexCount:amex.length,standardDefault:true,nllSeparate:true,
  familyPreservedUnlessOverridden:true,answersLocal:true,status:'PASS'}));
