const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const data=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',name),'utf8'));
const {makePlanner}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher}=require('../adapters/amex-questionnaire-v1.js');
const formal=data('amex-formal-product-identities.json');
const amexPolicy=data('amex-questionnaire-policy.json');
const cards=data('card-identity-index.json');
const ruleIndex=data('dynamic-questionnaire-rule-index.json');
const lookup=createLookup(cards);
const planner=makePlanner({ruleIndex,products:data('products.json'),
  baseQuestions:data('questions.json').common,frozenOfferFacts:data('frozen-offer-facts.json')});
const amexEnricher=createEnricher({policy:amexPolicy});
const facade=createFacade({planner,lookup,amexEnricher});
const amexRules=ruleIndex.rules.filter(x=>x.id.startsWith('AMEX'));
assert.equal(amexRules.length,31,'the reviewed Bank Rules source has 31 AMEX rows');
assert.equal(amexRules.filter(x=>x.runtime_class==='EXECUTABLE_RULE').length,23);
assert.deepEqual(new Set(amexPolicy.source.rule_ids),new Set(amexRules.map(r=>r.id)));
assert.equal(formal.count,32,'read 32 AMEX profiles from NB formal catalog');
assert.equal(formal.products.length,32);
assert.equal(cards.count,109,'98 original historical identities + 11 new formal identities');
assert.equal(cards.products.filter(p=>p.issuer==='AMEX').length,33,
  '32 formally cataloged plus separately documented Schwab Platinum');
assert.ok(!formal.products.some(p=>p.nb_card_id==='amex-amazon-business-prime'),
  'legacy artwork now issued by US Bank is not a current AMEX identity');
assert.equal(new Set(formal.products.map(p=>p.nb_card_id)).size,32);
assert.equal(new Set(formal.products.map(p=>p.assessment_product_id)).size,32);

for(const f of formal.products){
  const identity=lookup.findById(f.assessment_product_id);
  assert.ok(identity,'formal product mapped to Assessment ID '+f.nb_card_id);
  assert.equal(identity.formal_nb_card_id,f.nb_card_id);
  assert.equal(identity.issuer,'AMEX');
  assert.equal(identity.product_name,f.canonical_rule_product_name);
  assert.equal(identity.customer_type,f.customer_type);
  assert.equal(identity.card_form,f.card_form);
  assert.equal(identity.formal_application_availability,'UNKNOWN');
  const original=facade.plan({input:f.display_name});
  let result=original;
  if(original.status==='NEEDS_CONFIRMATION'||original.status==='AMBIGUOUS'){
    assert.ok([...(original.identity.candidates||[]),...(original.identity.suggestions||[])]
      .some(p=>p.product_id===f.assessment_product_id),
      'formal name must offer exactly reviewable candidate: '+f.nb_card_id);
    result=facade.plan({input:f.display_name,confirm_product_id:f.assessment_product_id});
  }
  assert.ok(result.questionnaire,'questionnaire must exist for '+f.nb_card_id+' '+result.status);
  assert.equal(result.questionnaire.evaluation_ready,false);
  assert.equal(result.questionnaire.questionnaire.benefits,null);
  assert.equal(result.identity.issuer,'AMEX');
  assert.equal(result.identity.formal_nb_card_id,f.nb_card_id);
  assert.equal(result.limitations.application_availability_verified,false);
  assert.equal(result.limitations.full_eligibility_result_available,false);
  const active=new Set(result.questionnaire.diagnostics.applicable_rule_ids);
  assert.ok(!active.has('AMEX-010'),'disabled 1/5 must never route for '+f.nb_card_id);
  assert.ok(active.has('AMEX-011'),'same-target spacing for '+f.nb_card_id);
  if(f.card_form==='REVOLVING_CREDIT'){
    for(const id of ['AMEX-006','AMEX-007'])
      assert.ok(active.has(id),id+' should apply to revolving '+f.nb_card_id);
    assert.ok(!active.has('AMEX-008'),'charge-cap rule must not apply to revolving cards');
  }else{
    assert.ok(active.has('AMEX-008'),'charge card count question for '+f.nb_card_id);
    assert.ok(!active.has('AMEX-006'),'revolving 2/90 must not apply to charge cards');
    assert.ok(!active.has('AMEX-007'),'revolving count must not apply to charge cards');
    assert.ok(!active.has('AMEX-010'),'inactive 1/5 must not apply to any product');
  }
  const groups=result.questionnaire.questionnaire.specific;
  const count=groups.find(x=>x.id==='F10_ISSUER_PORTFOLIO_COUNT');
  assert.ok(count,'F10 question for '+f.nb_card_id);
  assert.equal(count.type,'number');
  assert.ok(groups.find(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY'));
  assert.ok(!groups.find(q=>q.id==='F04_BONUS_HISTORY'),
    'AMEX source holding restrictions cannot silently turn into welcome-bonus receipt questions');
  const all=JSON.stringify(result);
  assert.ok(!all.includes('q7')&&!all.includes('q8'),'benefits are excluded');
}
const gold=facade.plan({input:'American Express Gold Card'});
const goldHistory=gold.questionnaire.questionnaire.specific.find(q=>q.id==='F03_CARD_HISTORY');
assert.ok(goldHistory,'reviewed Gold frozen offer enables held-history questions');
assert.equal(goldHistory.type,'multi');
assert.ok(goldHistory.options.some(q=>q.value==='The Platinum Card'));
assert.ok(goldHistory.options.some(q=>q.value==='Personal AMEX Gold'));
assert.equal(goldHistory.options.length,new Set(goldHistory.options.map(x=>x.value)).size);

const regularPlatinum=facade.plan({input:'AMEX Platinum'});
const platinumHistory=regularPlatinum.questionnaire.questionnaire.specific.find(q=>q.id==='F03_CARD_HISTORY');
assert.ok(platinumHistory);
assert.ok(platinumHistory.options.some(q=>q.value==='Platinum for Charles Schwab'));
assert.ok(!platinumHistory.options.some(q=>q.value==='Business Platinum'),
  'never import business family into personal Platinum');
const schwab=facade.plan({input:'Platinum for Charles Schwab'});
assert.ok(schwab.questionnaire.questionnaire.specific.some(q=>q.id==='F08_RELATIONSHIP'),
  'Schwab partner account requirement is unconditional in reviewed Bank Rules');
assert.ok(schwab.questionnaire.questionnaire.pending_terms.some(p=>p.rule_id==='AMEX-FL-002'));
const ms=facade.plan({input:'Platinum Card exclusively for Morgan Stanley'});
assert.ok(ms.questionnaire.questionnaire.specific.some(q=>
  q.id==='F08_RELATIONSHIP'&&q.title.includes('Morgan Stanley / E*TRADE')));
const deltaGold=facade.plan({input:'Delta SkyMiles Gold Card'});
assert.ok(deltaGold.questionnaire.questionnaire.pending_terms.some(p=>
  p.rule_id==='AMEX-FL-008'),'must flag missing current Delta family clause');
assert.ok(!deltaGold.questionnaire.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY'),
  'missing clause must not be silently treated as present');
const marriott=facade.plan({input:'Marriott Bonvoy Business Card'});
assert.ok(marriott.questionnaire.questionnaire.pending_terms.some(p=>
  p.rule_id==='AMEX-BIZ-005'));
const hilton=facade.plan({input:'Hilton Honors Surpass Card'});
assert.ok(!hilton.questionnaire.diagnostics.applicable_rule_ids.includes('AMEX-FL-011'),
  'Hilton no cross-tier block is a meta guard, not an executable restriction');
assert.equal(hilton.questionnaire.evaluation_ready,false);
const deltaBusiness=facade.plan({input:'Delta SkyMiles Reserve Business Card'});
assert.ok(!deltaBusiness.questionnaire.questionnaire.pending_terms.some(p=>
  /^AMEX-FL-00(7|8|9|10)$/.test(p.rule_id)),
  'personal Delta family clauses cannot route to business cards');
const opaque='PERSONAL_ANSWER_MARKER_DO_NOT_ECHO';
const privateResult=facade.plan({input:'American Express Blue Cash Everyday Card',
  known_facts:{F02_ISSUER_APPLICATION_HISTORY:{
    approved_revolving_90d:0,
    same_product_applied_or_approved_90d:'NO'},a2:opaque}});
assert.doesNotMatch(JSON.stringify(privateResult),/PERSONAL_ANSWER_MARKER_DO_NOT_ECHO/);
assert.ok(!privateResult.questionnaire.questionnaire.specific.some(q=>
  q.id==='F02_ISSUER_APPLICATION_HISTORY'),'same fact should not be asked twice');
for(const fname of ['adapters/amex-questionnaire-v1.js','adapters/card-questionnaire-facade-v1.js']){
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT,fname),'utf8'),
    /localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/,
    'no answer transport or persistence');
}
console.log(JSON.stringify({suite:'amex-formal-catalog-coverage',
  formalAmexCards:32,assessmentAmexIdentities:33,ruleRows:31,
  executableRestrictionRules:22,productFormRouting:true,
  productHistoryGating:true,benefitsExcluded:true,answersStayLocal:true,status:'PASS'}));
