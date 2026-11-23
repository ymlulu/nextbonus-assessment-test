const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const {makePlanner,targetState,gateState}=require('../adapters/dynamic-questionnaire-v1.js');

const ruleIndex=data('dynamic-questionnaire-rule-index.json');
const products=data('products.json');
const existing=data('questions.json');
const planner=makePlanner({ruleIndex,products,baseQuestions:existing.common,
  frozenOfferFacts:data('frozen-offer-facts.json')});

assert.equal(planner.getVersion().rule_count,129);
assert.equal(ruleIndex.facts.length,12);
assert.equal(ruleIndex.rules.filter(x=>x.runtime_class==='EXECUTABLE_RULE').length,89);
assert.equal(ruleIndex.rules.filter(x=>x.runtime_class==='REFERENCE_ONLY').length,15);
assert.equal(ruleIndex.rules.filter(x=>x.runtime_class==='INACTIVE').length,4);
assert.equal(new Set(ruleIndex.rules.map(x=>x.id)).size,129);
assert.equal(planner.listProducts().length,7);

const csp=planner.getQuestionnaire({product_id:'chase_sapphire_preferred'});
const amex=planner.getQuestionnaire({product_id:'amex_platinum'});
const citi=planner.getQuestionnaire({product_id:'citi_strata_elite'});
assert.equal(csp.questionnaire.benefits,null,'benefits are owned by a separate module');
assert.equal(csp.questionnaire.common.length,4);
assert.ok(csp.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.ok(!amex.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.ok(!citi.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.equal(csp.questionnaire.specific.filter(q=>q.id==='F01_RECENT_NEW_ACCOUNTS').length,1,
  'Chase 5/24 and other issuer rules dedupe the requested fact');
assert.ok(!csp.questionnaire.specific.some(q=>q.id==='F06_AU_BREAKDOWN'),
  'AU breakdown is not requested until 5/24 boundary can be affected');
assert.ok(!csp.diagnostics.applicable_rule_ids.includes('CHASE-010'),
  'CHASE-010 is executable meta, not a standalone restriction or question source');
const followup=planner.getQuestionnaire({product_id:'chase_sapphire_preferred',
  known_facts:{F01_RECENT_NEW_ACCOUNTS:5,a1:'Y2_PLUS'}});
assert.ok(followup.questionnaire.specific.some(q=>q.id==='F06_AU_BREAKDOWN'));
assert.ok(!followup.questionnaire.specific.some(q=>q.id==='F01_RECENT_NEW_ACCOUNTS'));
assert.ok(!followup.questionnaire.common.some(q=>q.id==='a1'));
const low=planner.getQuestionnaire({product_id:'chase_sapphire_preferred',
  known_facts:{F01_RECENT_NEW_ACCOUNTS:2}});
assert.ok(!low.questionnaire.specific.some(q=>q.id==='F06_AU_BREAKDOWN'));

assert.equal(gateState('frozen_offer.rule_clause_state["AMEX-001"] = PRESENT',
  {rule_clause_state:{'AMEX-001':'PRESENT'}}),true);
assert.equal(gateState('frozen_offer.rule_clause_state["AMEX-001"] = PRESENT',
  {rule_clause_state:{'AMEX-001':'ABSENT'}}),false);
assert.equal(gateState('frozen_offer.rule_clause_state["AMEX-001"] = PRESENT',{}),null);
assert.equal(gateState('frozen_offer.exact_target_terms_state = KNOWN',{}),null);
const amexWithoutOfferTerms=planner.getQuestionnaire({product_id:'amex_platinum',offer_facts:{}});
assert.ok(amexWithoutOfferTerms.diagnostics.unresolved_system_gates.some(x=>x.rule_id==='AMEX-001'),
  'missing offer clauses produce system gaps, never invented answers');
assert.ok(amex.diagnostics.applicable_rule_ids.includes('AMEX-008'));
assert.ok(!csp.diagnostics.applicable_rule_ids.includes('AMEX-008'));
assert.equal(targetState('target.product_name IN {Chase Sapphire Preferred; Chase Sapphire Reserve}',
  products.cards.chase_sapphire_reserve),true);
assert.equal(targetState('target.product_name IN {Chase Sapphire Preferred; Chase Sapphire Reserve}',
  products.cards.amex_gold),false);
assert.equal(targetState('target.issuer = AMEX AND target.card_form = CHARGE_OR_PAY_OVER_TIME',
  products.cards.amex_gold),true);
assert.equal(targetState('target.unknown_flag = YES',products.cards.amex_gold),null);
assert.throws(()=>planner.getQuestionnaire({product_id:'unknown'}),/UNKNOWN_PRODUCT/);

for(const product of planner.listProducts()){
  const first=planner.getQuestionnaire({product_id:product.product_id});
  const second=planner.getQuestionnaire({product_id:product.product_id});
  assert.deepEqual(first,second,'deterministic output for '+product.product_id);
  assert.ok(!JSON.stringify(first).includes('q7'),'Q7 not leaked');
  assert.ok(!JSON.stringify(first).includes('q8'),'Q8 not leaked');
}
const savedFact='PRIVATE_ANSWER_DO_NOT_ECHO';
const privatePlan=planner.getQuestionnaire({product_id:'amex_gold',
  known_facts:{F03_CARD_HISTORY:savedFact}});
assert.ok(!JSON.stringify(privatePlan).includes(savedFact),
  'submitted facts are never echoed into a response');
assert.equal(privatePlan.evaluation_ready,false,'no unreviewed scoring decision');

const source=fs.readFileSync(path.join(root,'adapters/dynamic-questionnaire-v1.js'),'utf8');
assert.doesNotMatch(source,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/,
  'pure planner cannot persist or upload user answers');
assert.ok(source.includes("const SKIP_CLASSES=new Set(['REFERENCE_ONLY','INACTIVE'])"));
console.log(JSON.stringify({kind:'standalone-dynamic-questionnaire',
  indexedRules:129,reviewedProducts:7,benefits:false,
  gateHandling:true,localOnly:true,status:'PASS'}));
