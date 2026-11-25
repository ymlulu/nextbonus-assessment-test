const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createClient}=require('../adapters/assessment-api-v2.js');
const root=path.resolve(__dirname,'..'),source=p=>fs.readFileSync(path.join(root,p),'utf8'),read=p=>JSON.parse(source(p));
const data={rulebook:read('bank-rules/rules.json'),factbook:read('bank-rules/facts.json'),products:read('bank-rules/products.json'),approval:read('bank-rules/approval.json'),identityIndex:read('data/card-identity-index.json')};
const client=createClient(data);
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',F01_RECENT_NEW_ACCOUNTS:0,F06_REPORTED_NEW_ACCOUNTS:0,F10_ISSUER_PORTFOLIO_COUNT:0,F10_CHARGE_PORTFOLIO_COUNT:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_revolving_90d:0,same_product_applied_or_approved_90d:'NO',citi_personal_application_lt_8d:'NO',citi_applications_65d:0,citi_business_application_lt_90d:'NO',bofa_approved_2m:0,bofa_approved_12m:0,bofa_approved_24m:0,cap1_application_or_approval_lt_6m:'NO',cap1_applications_30d:0,wf_consumer_opened_lt_4m:'NO',approved_chase_30d:0,approved_chase_business_30d:'NO'},
 F03_CARD_HISTORY:['NONE'],F03_CURRENT_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F04_EVER_BONUS_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],schwab_relationship:'YES',morgan_stanley_relationship:'YES',F04_CITI_BONUS_48M:['NONE'],F05_CITI_CONVERSION_48M:['NONE'],F12_CITI_OPENING_OFFER_48M:['NONE'],costco_active_membership:'YES',F03_HELD_WITHIN_24M:['NONE'],bofa_business_held_24m:'NO',F04_BONUS_RECEIVED_48M:['NONE'],cap1_business_ever_held:'NO',cap1_open_accounts:0,F03_HELD_OR_OPENED_48M:['NONE'],F03_OPENED_AND_RECEIVED_BONUS_15M:['NONE'],F03_OPENED_WITHIN_48M:['NONE'],discover_current_cards:0,recent_new_accounts_6m:0,recent_new_accounts_12m:0,F04_BONUS_RECEIVED_60M:['NONE'],usb_cashplus_upgrade:'NO',bilt_decline_lt_45d:'NO'};
const csp='chase_sapphire_preferred',gold='amex_gold';
const request=(product_id,known_facts=base,extra={})=>({product_id,known_facts,...extra});
function equalReport(r){
 assert.equal(r.report.dimensions.application,r.evaluation.application);
 assert.equal(r.report.dimensions.bonus,r.evaluation.bonus);
 assert.equal(r.report.decision,r.evaluation.decision);
 assert.equal(r.report.rule_results,r.evaluation.rule_results);
 assert.equal(r.report.answers_transmitted,false);
 assert.equal(r.report.benefits.status,'NOT_IN_SCOPE');
}
const reviewIds=new Set(["capital_one_venture","history_ot_bankofamerica_029","history_ot_bankofamerica_030","history_ot_capitalone_049","history_ot_capitalone_050","history_ot_capitalone_051","history_ot_bankofamerica_052","history_ot_bankofamerica_053","history_ot_bankofamerica_054","history_ot_wellsfargo_061","history_ot_wellsfargo_062","history_ot_capitalone_076","history_ot_capitalone_077","history_ot_capitalone_083","history_ot_bankofamerica_085","history_ot_capitalone_090","history_ot_capitalone_091","wf_choice","wf_choice_select","citi_costco_anywhere_visa","citi_costco_anywhere_business","bofa_atmos_rewards_summit","history_ot_u_s_bank_058","history_ot_discovercapitalone_063","history_ot_barclays_066","history_ot_barclays_067","history_ot_barclays_068","history_ot_barclays_069","history_ot_u_s_bank_088","history_ot_u_s_bank_089","history_ot_u_s_bank_096","history_ot_barclays_098"]);
for(const p of client.listCards()){
 const r=client.evaluate(request(p.product_id));equalReport(r);
 assert.equal(r.report.decision.code,reviewIds.has(p.product_id)?'REVIEW':'CLEAR',p.product_id);
 assert.deepEqual(r,client.evaluate(request(p.product_id)));
 const blank=client.evaluate(request(p.product_id,{}));equalReport(blank);
 assert.equal(blank.report.decision.code,'REVIEW',p.product_id);
 const plan=client.plan(request(p.product_id));assert.deepEqual(client.reportFromPlan(plan),r.report);
}
const check=(id,patch,expected,extra={})=>{
 const r=client.evaluate(request(id,{...base,...patch},extra));equalReport(r);assert.equal(r.report.decision.code,expected);return r;
};
check(csp,{F01_RECENT_NEW_ACCOUNTS:5},'WAIT');
check(csp,{F03_CURRENT_CARD_HISTORY:['Chase Sapphire Preferred']},'BLOCK');
check(csp,{F01_RECENT_NEW_ACCOUNTS:5,F04_EVER_BONUS_HISTORY:['Chase Sapphire Preferred']},'BLOCK');
check(gold,{F03_CARD_HISTORY:['The Platinum Card']},'BLOCK');
check(gold,{F03_CARD_HISTORY:['Personal AMEX Gold']},'CLEAR',{offer_variant:'NLL',offer_rule_overrides:{'AMEX-FL-004':'ABSENT'}});
check(csp,{F06_REPORTED_NEW_ACCOUNTS:5},'REVIEW');
check(csp,{a1:'LT_6M'},'RISK');
check('chase_ink_business_premier',{F03_CARD_HISTORY:['Ink Business Premier']},'RISK');
assert.equal(client.evaluate(request('missing',{})).report,null);
assert.equal(client.reportFromPlan({...client.plan(request(csp)),release_id:'obsolete'}),null);
const modified=structuredClone(data);modified.rulebook.rules.find(r=>r.id==='CHASE-002').condition.value=3;
const alt=createClient(modified),facts={...base,F02_ISSUER_APPLICATION_HISTORY:{...base.F02_ISSUER_APPLICATION_HISTORY,approved_chase_30d:2}};
assert.equal(client.evaluate(request(csp,facts)).report.decision.code,'WAIT');
const changed=alt.evaluate(request(csp,facts));equalReport(changed);assert.equal(changed.report.decision.code,'CLEAR');
assert.deepEqual(changed.questionnaire.questionnaire.editable.find(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY').fields.find(f=>f.id==='approved_chase_30d').count_bands.map(b=>b.value),[0,3]);
// Offer history and timing are explicitly dated optional snapshots, not current eligibility inputs.
const history=client.getOfferHistory({product_id:'amex_platinum',offerHistory:read('data/offer-history.json')});
assert.ok(history.history.length>0);
assert.equal(history.historical_reference_only,true);
assert.match(history.reference_date,/^\d{4}-\d{2}-\d{2}$/);
assert.ok(history.history.every(x=>x.display_eligible&&x.confidence==='HIGH'&&x.timing_eligible==='YES'&&x.date<=history.reference_date));
assert.ok(history.history.every(x=>x.comparison_unit===history.reference_offer.comparison_unit));
assert.ok(!JSON.stringify(history).includes('"raw"'));
assert.equal(client.getOfferHistory({product_id:'amex_platinum',offerHistory:read('data/offer-history.json'),evaluation_date:'2020-01-01'}),null);
assert.equal(client.getOfferTiming({product_id:csp,offerTiming:read('data/offer-timing.json')}).historical_reference_only,true);
assert.equal(client.getOfferTiming({product_id:'chase_ink_business_premier',offerTiming:read('data/offer-timing.json')}),null);
assert.throws(()=>client.getOfferHistory({product_id:csp,evaluation_date:'2026-02-30'}),/INVALID_EVALUATION_DATE/);
assert.doesNotMatch(source('adapters/assessment-api-v2.js'),/localStorage|sessionStorage|XMLHttpRequest|sendBeacon|fetch\(/);
const allowedPaths=['bank-rules/rules.json','bank-rules/facts.json','bank-rules/products.json','bank-rules/approval.json','data/card-identity-index.json','data/amex-formal-product-identities.json','data/offer-history.json','data/offer-timing.json'];
const messages=[],requests=[],listeners=[];
const ctx={URL,console,location:{origin:'https://ymlulu.github.io'},addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn);},
 fetch:async(p,opts)=>{requests.push({p,opts});assert.ok(allowedPaths.includes(p));assert.ok(!opts?.body);assert.ok(!opts?.method||opts.method==='GET');return {ok:true,json:async()=>read(p)};}};
ctx.window=ctx;vm.createContext(ctx);
const scripts=[...source('bridge.html').matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(scripts,['adapters/card-identity-v1.js','engines/bank-rules-runtime.js','adapters/assessment-api-v2.js','assets/assessment-loader-v2.js','adapters/static-bridge-v2.js']);
for(const p of scripts)vm.runInContext(source(p),ctx,{filename:p});
assert.equal(listeners.length,1);
const send=async(method,params,origin='https://ymlulu.github.io',channel='nextbonus-assessment-v2')=>{
 await listeners[0]({origin,source:{postMessage:(msg,target)=>messages.push({msg,target})},data:{channel,request_id:'test',method,params}});
};
(async()=>{
 await send('evaluate',{request:request(csp,{...base,F01_RECENT_NEW_ACCOUNTS:5})});
 assert.equal(messages[0].target,'https://ymlulu.github.io');
 assert.equal(messages[0].msg.result.report.decision.code,'WAIT');
 assert.deepEqual(JSON.parse(JSON.stringify(messages[0].msg.result)),client.evaluate(request(csp,{...base,F01_RECENT_NEW_ACCOUNTS:5})));
 await send('evaluate',{request:request(csp)},'https://untrusted.example');
 await send('evaluate',{request:request(csp)},'https://ymlulu.github.io','nextbonus-assessment-v1');
 assert.equal(messages.length,1,'untrusted origin and legacy channel ignored');
 assert.equal(requests.length,6,'eligibility only loads public rule and identity assets');
 await send('getOfferHistory',{product_id:'amex_platinum'});
 assert.equal(messages.at(-1).msg.result.historical_reference_only,true);
 assert.equal(requests.at(-1).p,'data/offer-history.json');
 await send('getOfferTiming',{product_id:csp});
 assert.equal(messages.at(-1).msg.result.historical_reference_only,true);
 assert.equal(requests.at(-1).p,'data/offer-timing.json');
 console.log(JSON.stringify({suite:'assessment-v2-contract',cards:client.listCards().length,report_uses_identical_decision:true,bridge_local:true,history_snapshot:true,status:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
