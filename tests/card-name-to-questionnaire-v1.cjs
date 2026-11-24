const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const {makePlanner}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');

const products=read('products.json');
const identityIndex=read('card-identity-index.json');
const lookup=createLookup(identityIndex);
const planner=makePlanner({products,ruleIndex:read('dynamic-questionnaire-rule-index.json'),
  baseQuestions:read('questions.json').common,
  frozenOfferFacts:read('frozen-offer-facts.json')});
const facade=createFacade({planner,lookup});
assert.equal(facade.getVersion().source_count,110);
assert.equal(facade.getVersion().rules_indexed,129);

const reviewed=facade.plan({input:'Chase Sapphire Preferred'});
assert.equal(reviewed.status,'MATCHED');
assert.equal(reviewed.identity.source,'REVIEWED_PRODUCT');
assert.equal(reviewed.questionnaire.product_id,'chase_sapphire_preferred');
assert.ok(reviewed.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.equal(reviewed.questionnaire.questionnaire.benefits,null);

const direct=facade.plan({input:
  'https://www.uscreditcards101.com/zh/cn/article/chase-sapphire-preferred/?utm_source=qa'});
assert.equal(direct.status,'MATCHED');
assert.equal(direct.identity.product_id,'chase_sapphire_preferred');

const historic=facade.plan({input:'Chase Freedom Unlimited'});
assert.equal(historic.status,'MATCHED');
assert.equal(historic.identity.source,'HISTORY_ONLY');
assert.equal(historic.questionnaire.questionnaire.common.length,4);
assert.ok(historic.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.ok(historic.questionnaire.diagnostics.unresolved_target_mappings.length>0,
  'unreviewed product family/lineage must stay unresolved');
assert.equal(historic.limitations.offer_terms_verified,false);
assert.equal(historic.limitations.full_eligibility_result_available,false);

const candidate=facade.plan({input:'Chase Freedom Flex'});
assert.equal(candidate.status,'MATCHED');
assert.equal(candidate.identity.source,'EXPANSION_CANDIDATE');
assert.equal(candidate.questionnaire.evaluation_ready,false);

const untrusted=facade.plan({input:'https://untrusted.example/chase-sapphire-preferred'});
assert.equal(untrusted.status,'NEEDS_CONFIRMATION');
assert.equal(untrusted.questionnaire,null,'untrusted URL slug is not evidence of a card');
assert.equal(untrusted.identity.candidates[0].product_id,'chase_sapphire_preferred');
const confirmed=facade.plan({
  input:'https://untrusted.example/chase-sapphire-preferred',
  confirm_product_id:'chase_sapphire_preferred'
});
assert.equal(confirmed.status,'CONFIRMED_CANDIDATE');
assert.ok(confirmed.questionnaire);

const generic=facade.plan({input:'Gold'});
assert.equal(generic.status,'NEEDS_CONFIRMATION');
assert.equal(generic.questionnaire,null);
assert.equal(generic.identity.candidates.length,1);
assert.equal(facade.plan({input:'Gold',confirm_product_id:'amex_gold'}).status,
  'CONFIRMED_CANDIDATE');

const unknown=facade.plan({input:'Some New Card Not In Database'});
assert.equal(unknown.status,'NOT_FOUND');
assert.equal(unknown.questionnaire,null);
const fallback=facade.plan({
  input:'Some New Card Not In Database',issuer:'CHASE',customer_type:'PERSONAL'
});
assert.equal(fallback.status,'PARTIAL_METADATA_PREVIEW');
assert.equal(fallback.identity.source,'USER_SUPPLIED_PARTIAL');
assert.ok(fallback.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-001'));
assert.ok(!fallback.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-008'));
assert.ok(fallback.questionnaire.diagnostics.unresolved_target_mappings.length>0,
  'no fabricated family, card form, or exact product identifiers');
assert.equal(fallback.limitations.offer_terms_verified,false);
const none=facade.plan({input:'Some New Card Not In Database',issuer:'CHASE'});
assert.equal(none.status,'NOT_FOUND','issuer alone must not imply personal card');
assert.equal(none.questionnaire,null);

const missingIssuer=facade.plan({input:'Discover it Cash Back'});
assert.equal(missingIssuer.status,'NEEDS_CONFIRMATION',
  'historical Discover / Capital One issuer ambiguity must be surfaced');
const unknownMetadata=facade.plan({input:'Some New Card Not In Database',
  issuer:'DISCOVER',customer_type:'PERSONAL'});
assert.equal(unknownMetadata.status,'PARTIAL_METADATA_PREVIEW');
assert.equal(unknownMetadata.limitations.product_specific_rules_verified,false);
assert.equal(facade.plan({input:'https://example.com/not-real',issuer:'CHASE',
  customer_type:'PERSONAL'}).status,'PARTIAL_METADATA_PREVIEW');

assert.equal(facade.plan({input:'not real',issuer:'BAD_BANK',
  customer_type:'PERSONAL'}).status,'INVALID_ISSUER');
assert.equal(facade.plan({input:'Chase Freedom Unlimited',
  issuer:'AMEX'}).status,'NOT_FOUND');
assert.equal(facade.plan({input:'Chase Freedom Unlimited',
  confirm_product_id:'amex_gold'}).status,'INVALID_CONFIRMATION');
assert.equal(facade.plan({input:'Chase Freedom Unlimited',
  customer_type:'BUSINESS'}).status,'CUSTOMER_TYPE_CONFLICT');

const sensitive='PRIVATE_ANSWER_DO_NOT_ECHO';
const output=facade.plan({input:'Chase Freedom Unlimited',
  known_facts:{a1:sensitive,F01_RECENT_NEW_ACCOUNTS:sensitive}});
assert.ok(!JSON.stringify(output).includes(sensitive));
assert.ok(output.questionnaire.questionnaire.common.length<4);
for(const p of identityIndex.products){
  const res=facade.plan({input:p.name});
  assert.ok(['MATCHED','NEEDS_CONFIRMATION','AMBIGUOUS'].includes(res.status),
    'all named historical cards are searchable: '+p.name+' -> '+res.status);
}
for(const source of ['adapters/card-identity-v1.js','adapters/card-questionnaire-facade-v1.js',
  'adapters/dynamic-questionnaire-v1.js']){
  const text=fs.readFileSync(path.join(root,source),'utf8');
  assert.doesNotMatch(text,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/,
    'no user-answer persistence or upload in '+source);
}
const html=fs.readFileSync(path.join(root,'dynamic-questionnaire.html'),'utf8');
assert.match(html,/id="issuer"/);
assert.match(html,/id="customer-type"/);
assert.match(html,/id="card-select"/);
assert.doesNotMatch(html,/id="card-query"/);
assert.equal(facade.listCards().length,109);
assert.equal(facade.plan({product_id:'amex_marriott_bonvoy_bevy'}).status,'MATCHED_ID');
assert.equal(facade.plan({product_id:'does_not_exist'}).status,'UNKNOWN_PRODUCT');
assert.match(html,/adapters\/card-identity-v1\.js/);
assert.match(html,/adapters\/card-questionnaire-facade-v1\.js/);
assert.doesNotMatch(html,/id="product"/);
console.log(JSON.stringify({kind:'independent-card-to-questionnaire',
  identities:98,reviewed:7,historyOnly:true,unknownFallback:true,
  urlConfirmation:true,benefits:false,answersUploaded:false,status:'PASS'}));
