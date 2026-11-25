const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRuntime,countBands}=require('../engines/bank-rules-runtime.js');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const rulebook=read('bank-rules/rules.json'),factbook=read('bank-rules/facts.json'),products=read('bank-rules/products.json'),approval=read('bank-rules/approval.json'),ids=read('data/card-identity-index.json');
const runtime=(book=rulebook)=>createRuntime({rulebook:book,factbook,products,approval});
const byId=id=>ids.products.find(p=>p.product_id===id);
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',
 F01_RECENT_NEW_ACCOUNTS:0,F06_REPORTED_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:0,approved_chase_business_30d:'NO',approved_revolving_90d:0,same_product_applied_or_approved_90d:'NO',citi_personal_application_lt_8d:'NO',citi_applications_65d:0,citi_business_application_lt_90d:'NO',bofa_approved_2m:0,bofa_approved_12m:0,bofa_approved_24m:0,cap1_application_or_approval_lt_6m:'NO',cap1_applications_30d:0,wf_consumer_opened_lt_4m:'NO'},
 F03_CARD_HISTORY:['NONE'],F03_CURRENT_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F04_EVER_BONUS_HISTORY:['NONE'],
 F07_MARRIOTT_HISTORY:['NONE'],F10_ISSUER_PORTFOLIO_COUNT:0,F10_CHARGE_PORTFOLIO_COUNT:0,schwab_relationship:'YES',morgan_stanley_relationship:'YES',F04_CITI_BONUS_48M:['NONE'],F05_CITI_CONVERSION_48M:['NONE'],F12_CITI_OPENING_OFFER_48M:['NONE'],costco_active_membership:'YES',F03_HELD_WITHIN_24M:['NONE'],bofa_business_held_24m:'NO',F04_BONUS_RECEIVED_48M:['NONE'],cap1_business_ever_held:'NO',cap1_open_accounts:0,F03_HELD_OR_OPENED_48M:['NONE'],F03_OPENED_AND_RECEIVED_BONUS_15M:['NONE'],F03_OPENED_WITHIN_48M:['NONE'],discover_current_cards:0,recent_new_accounts_6m:0,recent_new_accounts_12m:0,F04_BONUS_RECEIVED_60M:['NONE'],usb_cashplus_upgrade:'NO',bilt_decline_lt_45d:'NO'};
const ask=(rt,id,answers=base,opts={})=>rt.assess({product:byId(id),answers,...opts});
const evt=(r,id)=>r.evaluation.rule_results.find(x=>x.rule_id===id);
const q=(r,id)=>r.questionnaire.editable.find(x=>x.id===id);
const cuts=q=>q.count_bands.map(x=>x.value);
const csp='chase_sapphire_preferred',gold='amex_gold',aero='chase_aeroplan',bound='chase_marriott_bonvoy_boundless';
const rt=runtime();
assert.ok(rulebook.rules.length>0);
assert.equal(new Set(rulebook.rules.map(r=>r.id)).size,rulebook.rules.length);
assert.ok(!rulebook.rules.some(r=>r.id==='AMEX-010'));
const appReview=new Set(["capital_one_venture","history_ot_bankofamerica_029","history_ot_bankofamerica_030","history_ot_capitalone_049","history_ot_capitalone_050","history_ot_capitalone_051","history_ot_bankofamerica_052","history_ot_bankofamerica_053","history_ot_bankofamerica_054","history_ot_wellsfargo_061","history_ot_wellsfargo_062","history_ot_capitalone_076","history_ot_capitalone_077","history_ot_capitalone_083","history_ot_bankofamerica_085","history_ot_capitalone_090","history_ot_capitalone_091","wf_choice","wf_choice_select"]),bonusReview=new Set(["citi_costco_anywhere_visa","citi_costco_anywhere_business","bofa_atmos_rewards_summit","history_ot_capitalone_049","history_ot_capitalone_050","history_ot_u_s_bank_058","history_ot_discovercapitalone_063","history_ot_barclays_066","history_ot_barclays_067","history_ot_barclays_068","history_ot_barclays_069","history_ot_capitalone_076","history_ot_capitalone_077","history_ot_capitalone_083","history_ot_u_s_bank_088","history_ot_u_s_bank_089","history_ot_capitalone_090","history_ot_capitalone_091","history_ot_u_s_bank_096","history_ot_barclays_098"]);
for(const p of ids.products.filter(p=>rulebook.supported_issuers.includes(p.issuer))){
 const blank=rt.assess({product:p}),clean=rt.assess({product:p,answers:base});
 assert.ok(blank.questionnaire.editable.length,p.product_id);
 assert.equal(clean.evaluation.application.impact,0,p.product_id);
 assert.equal(clean.evaluation.bonus.impact,0,p.product_id);
 assert.equal(clean.evaluation.application.status,appReview.has(p.product_id)?'INSUFFICIENT_DATA':'MODEL_ONLY',p.product_id);
 assert.equal(clean.evaluation.bonus.status,bonusReview.has(p.product_id)?'NEEDS_REVIEW':'NO_TRIGGER_FOUND',p.product_id);
 assert.equal(clean.evaluation.answers_transmitted,false);
 assert.deepEqual(clean,rt.assess({product:p,answers:base}));
}
const r24=ask(rt,csp,{...base,F01_RECENT_NEW_ACCOUNTS:5});
assert.equal(evt(r24,'CHASE-001').application_action,'WAIT');
assert.equal(r24.evaluation.application.action,'WAIT');
assert.equal(r24.evaluation.application.impact,3);
assert.equal(r24.evaluation.bonus.impact,0);
for(let main=0;main<5;main++){
 const x=ask(rt,csp,{...base,F01_RECENT_NEW_ACCOUNTS:main,F06_REPORTED_NEW_ACCOUNTS:5});
 assert.equal(evt(x,'CHASE-001').status,'REVIEW');
}
const both=ask(rt,aero,{...base,F03_CURRENT_CARD_HISTORY:['Chase Aeroplan Card'],F04_BONUS_HISTORY:['Chase Aeroplan Card']});
assert.equal(both.evaluation.application.status,'PRODUCT_INELIGIBLE');
assert.equal(both.evaluation.bonus.status,'PRODUCT_INELIGIBLE');
assert.equal(both.evaluation.bonus.impact,3);
assert.equal(evt(both,'CHASE-PROD-007').trigger_sources.length,2);
assert.equal(evt(both,'CHASE-PROD-007').application_action,'BLOCK');
assert.equal(ask(rt,aero,{...base,F04_BONUS_HISTORY:['Chase Aeroplan Card']}).evaluation.application.action,'WAIT');
const family=ask(rt,gold,{...base,F03_CARD_HISTORY:['The Platinum Card']});
assert.equal(family.evaluation.bonus.impact,3);
assert.equal(family.evaluation.bonus.action,'BLOCK');
assert.equal(ask(rt,gold,{...base,F03_CARD_HISTORY:['The Platinum Card']},{offer_variant:'NLL'}).evaluation.bonus.impact,3);
assert.equal(ask(rt,gold,{...base,F03_CARD_HISTORY:['The Platinum Card']},{offer_variant:'NLL',offer_rule_overrides:{'AMEX-FL-004':'ABSENT'}}).evaluation.bonus.impact,0);
assert.equal(ask(rt,gold,base,{offer_facts:{}}).evaluation.bonus.status,'NEEDS_REVIEW');
for(const p of ids.products.filter(p=>p.issuer==='AMEX')){
 const standard=rt.assess({product:p,answers:base}),nll=rt.assess({product:p,answers:base,offer_variant:'NLL'});
 assert.ok(standard.diagnostics.applicable_rule_ids.includes('AMEX-001'),p.product_id);
 assert.ok(!nll.diagnostics.applicable_rule_ids.includes('AMEX-001'),p.product_id);
 assert.deepEqual(nll.diagnostics.applicable_rule_ids,standard.diagnostics.applicable_rule_ids.filter(id=>id!=='AMEX-001'),p.product_id+' NLL must preserve every other applicable rule');
}
assert.equal(ask(rt,csp,base,{offer_variant:'NLL'}).offer_context,null);
assert.deepEqual(ask(rt,csp,base,{offer_variant:'NLL'}).diagnostics,ask(rt,csp,base).diagnostics);
const runtimeSource=fs.readFileSync(path.join(root,'engines/bank-rules-runtime.js'),'utf8');
assert.doesNotMatch(runtimeSource,/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/,'live rule engine performs no network or storage operations');

assert.equal(ask(rt,'chase_ink_business_premier',{...base,F03_CARD_HISTORY:['Ink Business Premier']}).evaluation.bonus.impact,2);
const history=['AMEX Marriott Bonvoy Business / Legacy SPG Business','AMEX Marriott Bonvoy Bevy','AMEX Marriott Bonvoy Brilliant'];
const m=ask(rt,bound,{...base,F07_MARRIOTT_HISTORY:history});
for(const field of ['approved_within_90d','bonus_or_upgrade_within_24m']){
 const group=q(m,'F07_MARRIOTT_GROUP:'+field);
 assert.equal(group.options.length,3);
}
const mt=ask(rt,bound,{...base,F07_MARRIOTT_HISTORY:history,F07_MARRIOTT_DETAILS:{amex_marriott_business:{approved_within_90d:'YES'}}});
assert.equal(mt.evaluation.application.impact,0);assert.equal(mt.evaluation.bonus.impact,3);
assert.equal(mt.evaluation.bonus.action,'WAIT');
const mb=ask(rt,'amex_marriott_bonvoy_bevy',{...base,F07_MARRIOTT_HISTORY:['AMEX Marriott Bonvoy Brilliant']});
assert.equal(mb.evaluation.bonus.impact,3);
assert.equal(mb.evaluation.bonus.action,'BLOCK');
assert.equal(q(mb,'F03_CARD_HISTORY'),undefined,'one unified Marriott history question');
assert.ok(!q(mb,'F07_MARRIOTT_GROUP:approved_within_90d'),'lifetime condition has no timing question');
// Mutations to the data alone, using the exact same interpreter.
let book=structuredClone(rulebook),rule=book.rules.find(r=>r.id==='CHASE-002');
rule.condition.value=3;
let altered=runtime(book);
assert.deepEqual(cuts(q(ask(altered,csp,{}),'F02_ISSUER_APPLICATION_HISTORY').fields.find(f=>f.id==='approved_chase_30d')),[0,3]);
let answers={...base,F02_ISSUER_APPLICATION_HISTORY:{...base.F02_ISSUER_APPLICATION_HISTORY,approved_chase_30d:2}};
assert.equal(evt(ask(altered,csp,answers),'CHASE-002').status,'CLEAR');
answers.F02_ISSUER_APPLICATION_HISTORY.approved_chase_30d=3;
assert.equal(evt(ask(altered,csp,answers),'CHASE-002').status,'TRIGGERED');
rule.effect={application:1,bonus:0};
altered=runtime(book);assert.equal(ask(altered,csp,answers).evaluation.application.impact,1);
assert.equal(ask(altered,csp,answers).evaluation.application.action,'RISK');
rule.target.product_name=['Freedom Unlimited'];
altered=runtime(book);assert.ok(!q(ask(altered,csp,{}),'F02_ISSUER_APPLICATION_HISTORY'));
book.rules=book.rules.filter(r=>r.id!=='CHASE-002');
altered=runtime(book);assert.ok(!evt(ask(altered,csp,answers),'CHASE-002'));
book.rules.push({id:'TEST-NEW',target:{issuer:'CHASE',product_name:['Chase Sapphire Preferred']},
 condition:{fact:'approved_chase_30d',op:'gte',value:4},effect:{application:2,bonus:1}});
altered=runtime(book);assert.deepEqual(cuts(q(ask(altered,csp,{}),'F02_ISSUER_APPLICATION_HISTORY').fields[0]),[0,4]);
answers.F02_ISSUER_APPLICATION_HISTORY.approved_chase_30d=4;
assert.equal(ask(altered,csp,answers).evaluation.application.impact,2);
assert.equal(ask(altered,csp,answers).evaluation.bonus.impact,1);
book.rules.push({id:'TEST-SECOND',target:{issuer:'CHASE',product_name:['Chase Sapphire Preferred']},
 condition:{fact:'approved_chase_30d',op:'gte',value:2},effect:{application:1,bonus:2}});
altered=runtime(book);
assert.deepEqual(cuts(q(ask(altered,csp,{}),'F02_ISSUER_APPLICATION_HISTORY').fields[0]),[0,2,4]);
assert.equal(ask(altered,csp,answers).evaluation.application.impact,2);
assert.equal(ask(altered,csp,answers).evaluation.bonus.impact,2);
book.rules.at(-1).effect={application:0,bonus:0};assert.throws(()=>runtime(book),/NONZERO/);
book=structuredClone(rulebook);book.rules.push({...book.rules[0]});assert.throws(()=>runtime(book),/DUPLICATE/);
assert.deepEqual(countBands([2,5]).map(x=>x.value),[0,2,5]);
console.log(JSON.stringify({suite:'bank-rules-runtime',rules:rulebook.rules.length,cards:ids.products.filter(p=>rulebook.supported_issuers.includes(p.issuer)).length,mutations:'add/remove/threshold/scope/impact',matrix:'grouped',status:'PASS'}));
