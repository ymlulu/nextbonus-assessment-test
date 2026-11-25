// The single active dynamic questionnaire contract.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRuntime}=require('../engines/bank-rules-runtime.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const root=path.resolve(__dirname,'..'),source=p=>fs.readFileSync(path.join(root,p),'utf8'),read=p=>JSON.parse(source(p));
const data={rulebook:read('bank-rules/rules.json'),factbook:read('bank-rules/facts.json'),products:read('bank-rules/products.json'),approval:read('bank-rules/approval.json'),messages:read('bank-rules/messages.zh-CN.json')};
const index=read('data/card-identity-index.json'),formal=read('data/amex-formal-product-identities.json'),lookup=createLookup(index);
const runtime=createRuntime(data),facade=runtime.createFacade(lookup),plan=(product_id,known_facts={},opts={})=>facade.plan({product_id,known_facts,...opts});
const common={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',recent_new_accounts_12m:0,recent_applications_6m:0};
const base={...common,F01_RECENT_NEW_ACCOUNTS:0,F06_REPORTED_NEW_ACCOUNTS:0,F10_ISSUER_PORTFOLIO_COUNT:0,F10_CHARGE_PORTFOLIO_COUNT:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,same_product_applied_or_approved_90d:'NO',approved_chase_30d:0,approved_chase_business_30d:'NO'},
 F03_CARD_HISTORY:['NONE'],F03_CURRENT_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F04_EVER_BONUS_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],schwab_relationship:'YES',morgan_stanley_relationship:'YES'};
const cs='chase_sapphire_preferred',gold='amex_gold',delta='history_ot_amex_004',bce='history_ot_amex_035';
assert.equal(facade.getVersion().source_count,index.count);
assert.equal(facade.listCards().length,index.products.filter(p=>data.rulebook.supported_issuers.includes(p.issuer)).length);
assert.ok(facade.listCards().some(p=>p.product_id==='chase_ink_business_premier'));
assert.ok(facade.listCards().every(p=>!p.product_id.startsWith('fixture_')));
assert.equal(facade.plan({input:'Chase Sapphire Preferred'}).identity.product_id,cs);
assert.equal(facade.plan({input:'https://www.uscreditcards101.com/zh/cn/article/chase-sapphire-preferred/?utm_source=qa'}).identity.product_id,cs);
assert.equal(facade.plan({input:'https://untrusted.example/chase-sapphire-preferred'}).status,'NEEDS_CONFIRMATION');
assert.equal(facade.plan({input:'https://untrusted.example/chase-sapphire-preferred',confirm_product_id:cs}).status,'CONFIRMED_CANDIDATE');
assert.equal(facade.plan({input:'Gold'}).status,'NEEDS_CONFIRMATION');
assert.equal(facade.plan({input:'Gold',confirm_product_id:gold}).status,'CONFIRMED_CANDIDATE');
assert.equal(facade.plan({input:'Chase Freedom Unlimited',confirm_product_id:gold}).status,'INVALID_CONFIRMATION');
assert.equal(facade.plan({input:'Chase Freedom Unlimited',customer_type:'BUSINESS'}).status,'IDENTITY_CONFLICT');
assert.equal(plan('unknown_product').status,'UNKNOWN_PRODUCT');
assert.equal(facade.plan({input:'Some New Card Not In Database',issuer:'CHASE',customer_type:'PERSONAL'}).questionnaire,null);
for(const p of index.products)assert.ok(['MATCHED','NEEDS_CONFIRMATION','AMBIGUOUS'].includes(lookup.resolve({input:p.name}).status),p.name);
for(const p of formal.products){
 const o=plan(p.assessment_product_id,base);
 assert.equal(o.identity.formal_nb_card_id,p.nb_card_id);
 assert.equal(o.evaluation.application.status,'MODEL_ONLY',p.nb_card_id);
 assert.equal(o.evaluation.bonus.status,'NO_TRIGGER_FOUND',p.nb_card_id);
 assert.ok(!o.evaluation.rule_results.some(r=>r.rule_id==='AMEX-010'));
 assert.equal(o.questionnaire.questionnaire.benefits,null);
 assert.equal(o.limitations.application_availability_verified,false);
}
const missing=plan(gold,{}, {offer_facts:{}});
assert.equal(missing.limitations.offer_terms_verified,false);
assert.ok(missing.questionnaire.diagnostics.unresolved_system_gates.length);
assert.equal(missing.evaluation.bonus.status,'NEEDS_REVIEW');
assert.ok(!missing.questionnaire.questionnaire.editable.some(q=>q.id==='F03_CARD_HISTORY'));
assert.equal(plan(gold,common).evaluation.application.base_completed,true);
assert.equal(plan(gold,common).evaluation.application.issuer_rules_completed,false);
assert.equal(plan(gold,common).evaluation.application.complete,false);
assert.equal(plan(gold).evaluation.application.base_completed,false);
const withFiveDay=structuredClone(base);withFiveDay.F02_ISSUER_APPLICATION_HISTORY.approved_revolving_5d=99;
assert.deepEqual(plan(bce,withFiveDay).evaluation,plan(bce,base).evaluation);
for(const id of [bce,delta]){
 const q=plan(id).questionnaire.questionnaire.editable.find(q=>q.id==='F03_CARD_HISTORY');
 assert.ok(q.options.some(o=>o.label.includes('包括以前的版本')));
 assert.equal(new Set(q.options.map(o=>o.value)).size,q.options.length);
}
const previous=plan(delta,{...base,F03_CARD_HISTORY:['Delta SkyMiles Reserve (Personal)']});
assert.equal(previous.evaluation.bonus.action,'BLOCK');
assert.ok(previous.evaluation.bonus.triggered_rules.includes('AMEX-FL-009'));
const distinct=plan(cs,{...base,F03_CURRENT_CARD_HISTORY:['Chase Sapphire Reserve'],F04_EVER_BONUS_HISTORY:['Chase Sapphire Reserve']});
assert.equal(distinct.evaluation.application.impact,0);assert.equal(distinct.evaluation.bonus.impact,0);
const privateValue='PRIVATE_ANSWER_NEVER_ECHO';
assert.ok(!JSON.stringify(plan(cs,{a1:privateValue,F01_RECENT_NEW_ACCOUNTS:privateValue})).includes(privateValue));
assert.equal(plan(cs).evaluation.answers_transmitted,false);
function rejects(change,re,catalog=false){
 const d=structuredClone(data);change(d);
 assert.throws(()=>{const rt=createRuntime(d);if(catalog)rt.createFacade(lookup);},re);
}
const find=(d,id)=>d.rulebook.rules.find(r=>r.id===id);
rejects(d=>find(d,'CHASE-002').target.product_nmae='Typo',/INVALID_TARGET_SCOPE/);
rejects(d=>find(d,'CHASE-002').condition.fact='unknown_fact',/UNKNOWN_CONDITION/);
rejects(d=>find(d,'CHASE-002').condition.value=-1,/INVALID_THRESHOLD/);
rejects(d=>find(d,'CHASE-002').condition.op='typo',/UNKNOWN_CONDITION/);
rejects(d=>find(d,'CHASE-002').effect.application=1,/INVALID_HARD_ACTION/);
rejects(d=>find(d,'CHASE-002').condition.values=[1],/INVALID_THRESHOLD/);
rejects(d=>find(d,'AMEX-001').offer_scenarios.STANDARD='GUESS',/INVALID_OFFER_SCENARIO/);
rejects(d=>find(d,'CHASE-002').target.product_name=['Nonexistent product'],/RULE_TARGET_NOT_FOUND/,true);
rejects(d=>find(d,'CHASE-PROD-014').target.product_name.push('Nonexistent Avios'),/RULE_PRODUCT_NOT_FOUND/,true);
rejects(d=>{d.products.overrides.missing_product={product_name:'Missing'};},/UNKNOWN_PRODUCT_MAPPING/,true);
rejects(d=>{d.factbook.facts.amex_charge_count.answer_key=d.factbook.facts.amex_revolving_count.answer_key;},/DUPLICATE_FACT_ANSWER_KEY/);
rejects(d=>{d.factbook.facts.held_now.history_id='missing';},/INVALID_GROUPED_FACT/);
rejects(d=>{d.factbook.facts.approved_chase_30d.window.value=0;},/INVALID_FACT_WINDOW/);
rejects(d=>find(d,'AMEX-FL-012').condition.values.push('NONEXISTENT_MARRIOTT'),/UNKNOWN_HISTORY_OPTION/);
rejects(d=>find(d,'CHASE-002').effect={application:0,bonus:0},/NONZERO/);
rejects(d=>find(d,'CHASE-002').condition={all:[],any:[]},/INVALID_COMPOUND_CONDITION/);
rejects(d=>{d.rulebook.rules.push(structuredClone(d.rulebook.rules[0]));},/DUPLICATE/);
rejects(d=>{d.products.unlisted_targets=[];},/RULE_TARGET_NOT_FOUND/,true);
const expanded=structuredClone(data);expanded.rulebook.supported_issuers.push('TEST_BANK');
expanded.rulebook.rules.push({id:'TEST-NEW-BANK',target:{issuer:'TEST_BANK'},condition:{fact:'F01_RECENT_NEW_ACCOUNTS',op:'gte',value:3},effect:{application:2,bonus:0}});
const generic=createRuntime(expanded),p={product_id:'test_citi',product_name:'Fixture only',issuer:'TEST_BANK'};
assert.deepEqual(generic.assess({product:p}).questionnaire.editable.find(q=>q.id==='F01_RECENT_NEW_ACCOUNTS').count_bands.map(x=>x.value),[0,3]);
assert.equal(generic.assess({product:p,answers:{F01_RECENT_NEW_ACCOUNTS:3}}).evaluation.application.impact,2);
rejects(d=>{d.rulebook.coverage_checks[0].dimension='UNKNOWN';},/INVALID_COVERAGE_CHECK/);
rejects(d=>{d.rulebook.coverage_checks[0].id='BOFA-001';},/INVALID_COVERAGE_CHECK/);
rejects(d=>{find(d,'CAP1-007').offer_clause=undefined;},/INVALID_OFFER_THRESHOLD/);
rejects(d=>{d.approval.activity_facts.push('unknown_fact');},/INVALID_APPROVAL_FACTS/);
rejects(d=>{d.approval.activity_bands[1].min=0;},/INVALID_APPROVAL_BANDS/);
rejects(d=>{d.factbook.count_relations[0].shorter='recent_applications_6m';},/INVALID_COUNT_RELATION/);
rejects(d=>{d.messages.facts.recent_new_accounts_12m.result_reason='no threshold placeholder';},/INVALID_RESULT_REASON/);
rejects(d=>{delete d.messages;},/LANGUAGE_PACK_REQUIRED/);
rejects(d=>{delete d.messages.facts.recent_new_accounts_12m;},/MISSING_FACT_LANGUAGE/);
rejects(d=>{delete d.messages.facts.a1.options.LT_6M;},/MISSING_LANGUAGE_KEY/);
const copyOnly=structuredClone(data);
copyOnly.messages.decision.WAIT.label='TEST_TRANSLATED_WAIT';
copyOnly.messages.facts.approved_chase_30d.title='TEST_TRANSLATED_QUESTION';
copyOnly.messages.facts.approved_chase_30d.type='multi'; // ignored non-display key
copyOnly.messages.rule_labels['CHASE-002']='TEST_TRANSLATED_RULE';
const copied=createRuntime(copyOnly).createFacade(lookup);
const request={product_id:'chase_sapphire_preferred',known_facts:{...common,F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:2}}};
const original=facade.plan(request),translated=copied.plan(request);
assert.equal(translated.evaluation.decision.code,original.evaluation.decision.code);
assert.equal(translated.evaluation.decision.label,'TEST_TRANSLATED_WAIT');
assert.equal(translated.evaluation.application.impact,original.evaluation.application.impact);
assert.deepEqual(translated.evaluation.rule_results.map(r=>[r.rule_id,r.status,r.application_impact,r.bonus_impact]),original.evaluation.rule_results.map(r=>[r.rule_id,r.status,r.application_impact,r.bonus_impact]));
assert.equal(translated.questionnaire.questionnaire.editable.find(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY').fields.find(q=>q.id==='approved_chase_30d').label,'TEST_TRANSLATED_QUESTION');
const html=source('dynamic-questionnaire.html'),ui=source('assets/dynamic-questionnaire-demo.js'),engine=source('engines/bank-rules-runtime.js');
assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]),['adapters/card-identity-v1.js','engines/bank-rules-runtime.js','adapters/assessment-api-v2.js','assets/assessment-loader-v2.js','assets/dynamic-questionnaire-demo.js']);
for(const s of [ui,engine])assert.doesNotMatch(s,/\b(?:AMEX|CHASE|CITI|BOFA|CAP1|WF|DISC|BARC|USB|BILT)-(?:PROD-|FL-|REL-|BIZ-)?\d{3}\b/);
for(const s of [engine,source('adapters/card-identity-v1.js')])assert.doesNotMatch(s,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
const retired=["adapters/amex-offer-context-v1.js","adapters/amex-questionnaire-v1.js","adapters/card-questionnaire-facade-v1.js","adapters/chase-questionnaire-v1.js","adapters/dynamic-questionnaire-v1.js","engines/amex-decision-v1.js","engines/chase-decision-v1.js","engines/marriott-matrix-v1.js","data/amex-questionnaire-policy.json","data/chase-questionnaire-policy.json","data/dynamic-questionnaire-rule-index.json","data/marriott-eligibility-matrix.json"];
for(const p of retired){assert.ok(!fs.existsSync(path.join(root,p)),'retired duplicate still exists: '+p);assert.ok(!ui.includes(p),'old source loaded: '+p);}
console.log(JSON.stringify({suite:'bank-rules-contract',supported_cards:facade.listCards().length,invalid_data_cases:28,retired_sources:retired.length,new_issuer_data_only:true,status:'PASS'}));
