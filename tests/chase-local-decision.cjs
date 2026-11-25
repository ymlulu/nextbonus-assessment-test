const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const {makePlanner,targetState}=require('../adapters/dynamic-questionnaire-v1.js');
const {createLookup}=require('../adapters/card-identity-v1.js');
const {createFacade}=require('../adapters/card-questionnaire-facade-v1.js');
const {createEnricher:chaseEnricher}=require('../adapters/chase-questionnaire-v1.js');
const {createEnricher:amexEnricher}=require('../adapters/amex-questionnaire-v1.js');
const chaseDecision=require('../engines/chase-decision-v1.js');
const amexDecision=require('../engines/amex-decision-v1.js');
const amexOfferContext=require('../adapters/amex-offer-context-v1.js');
const {createMatrix}=require('../engines/marriott-matrix-v1.js');
const policy=data('chase-questionnaire-policy.json');
const index=data('dynamic-questionnaire-rule-index.json');
const identities=data('card-identity-index.json');
const chase=identities.products.filter(p=>p.issuer==='CHASE');
assert.equal(chase.length,30);
const active=index.rules.filter(r=>r.id.startsWith('CHASE')&&r.runtime_class==='EXECUTABLE_RULE');
assert.equal(active.length,21);
assert.deepEqual(new Set(Object.keys(policy.rules)),new Set(active.map(x=>x.id)));
assert.equal(Object.keys(policy.canonical_target_names).length,30);
const facade=createFacade({
 planner:makePlanner({ruleIndex:index,products:data('products.json'),
  baseQuestions:data('questions.json').common,frozenOfferFacts:data('frozen-offer-facts.json')}),
 lookup:createLookup(identities),chasePolicy:policy,chaseEnricher:chaseEnricher({policy}),
 chaseDecision,ruleIndex:index,targetState,
 amexEnricher:amexEnricher({policy:data('amex-questionnaire-policy.json')}),
 amexOfferContext,amexDecision,amexPolicy:data('amex-questionnaire-policy.json'),
 approvalConfig:data('approval-config.json'),
 marriottMatrix:createMatrix(data('marriott-eligibility-matrix.json'))
});
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',
 F01_RECENT_NEW_ACCOUNTS:0,F06_AU_BREAKDOWN:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:0,
  approved_chase_business_30d:'NO'},
 F03_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE']};
function run(product_id,changes={}){
 return facade.plan({product_id,known_facts:{...base,...changes}});
}
function hasTrigger(result,id,dim='APPLICATION'){
 return result.evaluation[dim==='BONUS'?'bonus':'application'].triggered_rules.includes(id);
}
for(const item of chase){
 const r=run(item.product_id);
 assert.equal(r.identity.issuer,'CHASE');
 assert.ok(r.questionnaire,'every Chase catalog identity creates a questionnaire: '+item.product_id);
 assert.ok(r.evaluation,'every Chase identity gets a local Chase evaluation: '+item.product_id);
 assert.ok(r.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-001'),
  '5/24 baseline applies across Chase cards');
 assert.ok(r.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-002'),
  '2/30 applies across Chase cards');
 assert.ok(!r.evaluation.rule_results.some(v=>v.rule_id==='AMEX-010'));
 assert.ok(!r.questionnaire.diagnostics.unresolved_target_mappings.some(x=>x.rule_id==='CHASE-PROD-013'),
  'known non-Club identity must exclude the Club lineage rule, including reviewed Sapphire cards');
 assert.equal(r.evaluation.application.base_risk,'HIGH');
 assert.equal(r.evaluation.bonus.status,'NO_TRIGGER_FOUND',
  'clean known profile has no modeled bonus trigger: '+item.product_id);
 assert.equal(r.evaluation.answers_transmitted,false);
 assert.equal(r.evaluation.review_only,true);
 assert.equal(r.evaluation.benefits_included,false);
 assert.ok(!r.questionnaire.questionnaire.specific.some(q=>q.id==='F04_BONUS_HISTORY'&&
   q.type==='fact_group'),'Chase bonus question must be an actual checkbox group');
 if(item.customer_type==='BUSINESS')
  assert.ok(r.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-012'),
   'business application frequency stays separate from general 2/30');
 else assert.ok(!r.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-012'));
}
const csp='chase_sapphire_preferred',csr='chase_sapphire_reserve';
assert.ok(hasTrigger(run(csp,{F01_RECENT_NEW_ACCOUNTS:5}),'CHASE-001'));
assert.ok(!hasTrigger(run(csp,{F01_RECENT_NEW_ACCOUNTS:4,F06_AU_BREAKDOWN:0}),'CHASE-001'));
let r=run(csp,{F01_RECENT_NEW_ACCOUNTS:4,F06_AU_BREAKDOWN:1});
assert.ok(r.evaluation.application.unresolved_rules.some(x=>x.rule_id==='CHASE-001'&&x.status==='REVIEW'),
 'AU is an unresolved reported-count boundary, not an automatic pass');
r=run(csp,{F01_RECENT_NEW_ACCOUNTS:4,F06_AU_BREAKDOWN:undefined});
assert.ok(r.questionnaire.questionnaire.specific.some(q=>q.id==='F06_AU_BREAKDOWN'&&q.type==='number'));
assert.ok(r.evaluation.application.missing_rules.includes('CHASE-001'));
r=run(csp,{F01_RECENT_NEW_ACCOUNTS:5,F06_AU_BREAKDOWN:undefined});
assert.ok(!r.questionnaire.questionnaire.specific.some(q=>q.id==='F06_AU_BREAKDOWN'),
 'AU cannot undo 5 confirmed main accounts and need not be asked');
assert.ok(hasTrigger(run(csp,{F02_ISSUER_APPLICATION_HISTORY:{
 approved_chase_30d:2,approved_chase_business_30d:'NO'}}),'CHASE-002'));
r=run(csp,{F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:1}});
assert.ok(!r.questionnaire.questionnaire.specific.some(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY'),
 'personal Chase only needs 2/30, no mandatory business question');
r=run('history_ot_chase_071',{
 F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:0}});
const f02=r.questionnaire.questionnaire.specific.find(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY');
assert.ok(f02&&f02.fields.some(f=>f.id==='approved_chase_business_30d'));
assert.ok(r.evaluation.application.missing_rules.includes('CHASE-012'));
assert.ok(hasTrigger(run('history_ot_chase_071',{F02_ISSUER_APPLICATION_HISTORY:{
 approved_chase_30d:0,approved_chase_business_30d:'YES'}}),'CHASE-012'));
assert.ok(!hasTrigger(run(csp,{F03_CARD_HISTORY:['Chase Sapphire Reserve']}),'CHASE-PROD-017'),
 'holding other personal Sapphire must not block exact CSP current-holder rule');
assert.ok(hasTrigger(run(csp,{F03_CARD_HISTORY:['Chase Sapphire Preferred']}),'CHASE-PROD-017'));
assert.ok(hasTrigger(run(csr,{F03_CARD_HISTORY:['Chase Sapphire Reserve']}),'CHASE-PROD-018'));
assert.ok(hasTrigger(run(csp,{F04_BONUS_HISTORY:['Chase Sapphire Preferred']}),'CHASE-003','BONUS'),
 'historical same-target welcome award affects CSP bonus eligibility');
assert.ok(!hasTrigger(run(csp,{F04_BONUS_HISTORY:['Chase Sapphire Reserve']}),'CHASE-003','BONUS'),
 'other Sapphire bonus is not the exact-target one-time restriction');
assert.ok(hasTrigger(run('chase_ihg_one_rewards_premier',{
 F03_CARD_HISTORY:['IHG One Rewards Traveler']}),'CHASE-PROD-001'));
assert.ok(hasTrigger(run('chase_ihg_one_rewards_premier',{
 F04_BONUS_HISTORY:['IHG One Rewards Traveler']}),'CHASE-PROD-002'));
assert.ok(hasTrigger(run('history_ot_chase_043',{
 F03_CARD_HISTORY:['Southwest Premier']}),'CHASE-PROD-005'));
assert.ok(hasTrigger(run('history_ot_chase_043',{
 F04_BONUS_HISTORY:['Southwest Plus']}),'CHASE-PROD-005'));
assert.ok(!hasTrigger(run('history_ot_chase_095',{
 F03_CARD_HISTORY:['Southwest Premier']}),'CHASE-PROD-016','BONUS'),
 'personal Southwest history does not block business exact-target');
assert.ok(hasTrigger(run('chase_freedom_flex',{
 F03_CARD_HISTORY:['Freedom Flex']}),'CHASE-PROD-011'));
assert.ok(!hasTrigger(run('chase_freedom_flex',{
 F03_CARD_HISTORY:['Freedom Unlimited']}),'CHASE-PROD-011'),
 'no invented cross-Freedom tier restriction');
assert.ok(hasTrigger(run('history_ot_chase_072',{
 F03_CARD_HISTORY:['Ink Business Unlimited']}),'CHASE-005','BONUS'));
r=run('history_ot_chase_072',{F03_CARD_HISTORY:['OTHER_CHASE_NO_FEE_BUSINESS']});
assert.ok(r.evaluation.rule_results.some(x=>x.rule_id==='CHASE-005'&&x.status==='REVIEW'),
 'unnamed no-fee Chase business predecessor must not turn into hard restriction');
assert.ok(hasTrigger(run('history_ot_chase_084',{
 F03_CARD_HISTORY:['World of Hyatt Business Credit Card']}),'CHASE-PROD-015','BONUS'));
assert.ok(!hasTrigger(run('history_ot_chase_084',{
 F03_CARD_HISTORY:['World of Hyatt Personal']}),'CHASE-PROD-015','BONUS'),
 'personal Hyatt does not block business Hyatt');
r=run('history_ot_chase_018',{F04_BONUS_HISTORY:['British Airways Visa']});
assert.ok(hasTrigger(r,'CHASE-PROD-014'));
assert.ok(!r.questionnaire.diagnostics.applicable_rule_ids.includes('CHASE-PROD-013'),
 'non-Club Chase identities must not inherit the United Club lineage rule');
r=run('history_ot_chase_047',{F01_RECENT_NEW_ACCOUNTS:5});
assert.ok(hasTrigger(r,'CHASE-001'));
assert.match(r.evaluation.rule_results.find(x=>x.rule_id==='CHASE-001').reason,/例外报告/);
const partial=facade.plan({input:'A card not listed',issuer:'CHASE',customer_type:'PERSONAL',
 known_facts:{...base}});
assert.ok(partial.questionnaire);
assert.equal(partial.identity.source,'USER_SUPPLIED_PARTIAL');
assert.equal(partial.evaluation.answers_transmitted,false);
assert.ok(partial.evaluation.application.unresolved_rules.length>0,
 'unknown card metadata must not be silently treated as fully verified');
// Every applicable explicit product availability gate must independently
// block the product and its new-card reward, regardless of base-risk data.
const gateIds=Object.entries(policy.rules).filter(([,v])=>v.product_eligibility).map(([id])=>id);
assert.equal(gateIds.length,11);
const checked=new Set();
for(const item of chase){
 const initial=run(item.product_id);
 const applicable=initial.questionnaire.diagnostics.applicable_rule_ids;
 for(const id of gateIds.filter(id=>applicable.includes(id))){
  const rule=policy.rules[id];
  for(const [key,scope] of [['F03_CARD_HISTORY',rule.history_scope],['F04_BONUS_HISTORY',rule.bonus_scope]]){
   if(!scope?.length)continue;
   const value=scope[0]==='$TARGET'?policy.canonical_target_names[item.product_id]:scope[0];
   const triggered=run(item.product_id,{[key]:[value],a1:undefined}).evaluation;
   assert.equal(triggered.application.status,'PRODUCT_INELIGIBLE',id+' app gate');
   assert.equal(triggered.bonus.status,'PRODUCT_INELIGIBLE',id+' bonus gate');
   assert.ok(triggered.application.triggered_rules.includes(id));
   assert.ok(triggered.bonus.triggered_rules.includes(id));
   const event=triggered.rule_results.find(x=>x.rule_id===id);
   assert.ok(event.product_eligibility);
   assert.ok(event.trigger_sources.some(x=>x.question_id===key&&x.value===value));
   checked.add(id);
  }
 }
}
// United Club currently has no applicable catalog identity; check the engine
// directly with the reviewed lineage rule, without inventing a new product.
for(const id of gateIds.filter(id=>!checked.has(id))){
 const rule=policy.rules[id];
 const product={issuer:'CHASE',product_id:'test-gate',product_name:rule.history_scope?.[0]||rule.bonus_scope?.[0]};
 for(const [key,scope] of [['F03_CARD_HISTORY',rule.history_scope],['F04_BONUS_HISTORY',rule.bonus_scope]]){
  if(!scope?.length)continue;
  const value=scope[0]==='$TARGET'?product.product_name:scope[0];
  const decision=chaseDecision.evaluate({product,plan:{diagnostics:{applicable_rule_ids:[id]}},
   policy,approvalConfig:data('approval-config.json'),answers:{...base,[key]:[value]}});
  assert.equal(decision.application.status,'PRODUCT_INELIGIBLE',id);
  assert.equal(decision.bonus.status,'PRODUCT_INELIGIBLE',id);
 }
}
const aeroplan='chase_aeroplan', aeroplanName='Chase Aeroplan Card', aeroplanRule='CHASE-PROD-007';
for(const held of [false,true])for(const awarded of [false,true]){
 const v=run(aeroplan,{F03_CARD_HISTORY:[held?aeroplanName:'NONE'],
  F04_BONUS_HISTORY:[awarded?aeroplanName:'NONE']}).evaluation;
 const blocked=held||awarded;
 assert.equal(v.application.status,blocked?'PRODUCT_INELIGIBLE':'MODEL_ONLY');
 assert.equal(v.bonus.status,blocked?'PRODUCT_INELIGIBLE':'NO_TRIGGER_FOUND');
 const ev=v.rule_results.find(x=>x.rule_id===aeroplanRule);
 assert.equal(ev.status,blocked?'TRIGGERED':'CLEAR');
 assert.equal(ev.trigger_sources?.length||0,Number(held)+Number(awarded));
}
// IHG personal cards use two distinct product gates. Both must be
// independently visible in the application and bonus decision.
for(const product_id of ['chase_ihg_one_rewards_premier','history_ot_chase_044']){
 for(const held of [false,true])for(const awarded of [false,true]){
  const v=run(product_id,{F03_CARD_HISTORY:[held?'IHG One Rewards Premier':'NONE'],
   F04_BONUS_HISTORY:[awarded?'IHG One Rewards Traveler':'NONE']}).evaluation;
  assert.equal(v.application.status,held||awarded?'PRODUCT_INELIGIBLE':'MODEL_ONLY');
  assert.equal(v.bonus.status,held||awarded?'PRODUCT_INELIGIBLE':'NO_TRIGGER_FOUND');
  for(const key of ['application','bonus']){
   assert.equal(v[key].triggered_rules.includes('CHASE-PROD-001'),held);
   assert.equal(v[key].triggered_rules.includes('CHASE-PROD-002'),awarded);
  }
 }
}
const incompleteGate=run(aeroplan,{F03_CARD_HISTORY:undefined}).evaluation;
assert.equal(incompleteGate.bonus.status,'NEEDS_REVIEW');
assert.ok(incompleteGate.bonus.missing_rules.includes(aeroplanRule));
for(const changes of [{F01_RECENT_NEW_ACCOUNTS:5},{F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:2}}]){
 const v=run(aeroplan,changes).evaluation;
 assert.equal(v.application.status,'ELEVATED_RISK');
 assert.equal(v.bonus.status,'NO_TRIGGER_FOUND');
 assert.deepEqual(v.bonus.product_blocking_rules,[]);
}
// Marriott target coverage is independent of the 21 indexed Chase rules.
const marriottTargets=[
 ['chase_marriott_bonvoy_boundless','Chase Marriott Bonvoy Bold / Boundless','chase_bold_boundless'],
 ['history_ot_chase_045','Chase Marriott Bonvoy Bold / Boundless','chase_bold_boundless'],
 ['history_ot_chase_046','Chase Marriott Bonvoy Bountiful','chase_bountiful']
];
const crossHistories=[
 ['AMEX Marriott / Legacy SPG Personal','amex_marriott_legacy_personal'],
 ['AMEX Marriott Bonvoy Business / Legacy SPG Business','amex_marriott_business'],
 ['AMEX Marriott Bonvoy Bevy','amex_marriott_bevy'],
 ['AMEX Marriott Bonvoy Brilliant','amex_marriott_brilliant']
];
function matrixRun(pid,history,details={}){
 return run(pid,{F07_MARRIOTT_HISTORY:history,F07_MARRIOTT_DETAILS:details});
}
const ruleEvent=(v,id)=>v.evaluation.rule_results.find(x=>x.rule_id==='MARRIOTT-MATRIX:'+id);
for(const [pid,name,id] of marriottTargets){
 let v=matrixRun(pid,undefined);
 assert.equal(v.evaluation.bonus.status,'NEEDS_REVIEW');
 assert.equal(v.evaluation.application.status,'INSUFFICIENT_DATA');
 const history=v.questionnaire.questionnaire.specific.find(q=>q.id==='F07_MARRIOTT_HISTORY');
 assert.ok(history);
 assert.equal(history.options.length,5,'exact target history group plus four Amex groups');
 assert.ok(history.options.some(x=>x.value===name));
 if(id==='chase_bold_boundless')assert.match(history.options.find(x=>x.value===name).label,/Premier Plus/);
 for(const [held,award] of [['NO','NO'],['YES','NO'],['NO','YES'],['YES','YES']]){
  v=matrixRun(pid,[name],{[id]:{held_now:held,new_card_bonus_within_24m:award}});
  const block=held==='YES'||award==='YES';
  assert.equal(v.evaluation.application.status,block?'PRODUCT_INELIGIBLE':'MODEL_ONLY');
  assert.equal(v.evaluation.bonus.status,block?'PRODUCT_INELIGIBLE':'NO_TRIGGER_FOUND');
  assert.equal(ruleEvent(v,id).status,block?'TRIGGERED':'CLEAR');
 }
 v=matrixRun(pid,[name],{[id]:{held_now:'NO',bonus_or_upgrade_within_24m:'YES'}});
 assert.equal(v.evaluation.bonus.status,'NEEDS_REVIEW','upgrade cannot count as Chase new-card bonus');
 const q=v.questionnaire.questionnaire.specific.find(q=>q.fact_field==='new_card_bonus_within_24m');
 assert.deepEqual(q.options.map(x=>x.value),[id]);
 for(const [cross,crossId] of crossHistories){
  const allDates={held_now:'NO',closed_within_30d:'NO',approved_within_90d:'NO',bonus_or_upgrade_within_24m:'NO'};
  const keys=id==='chase_bountiful'?Object.keys(allDates):
    crossId==='amex_marriott_legacy_personal'?['held_now','closed_within_30d']:['approved_within_90d','bonus_or_upgrade_within_24m'];
  for(const key of keys){
   v=matrixRun(pid,[cross],{[crossId]:{...allDates,[key]:'YES'}});
   assert.equal(v.evaluation.application.status,'MODEL_ONLY',pid+' '+crossId+' '+key);
   assert.equal(v.evaluation.bonus.status,'BONUS_INELIGIBLE');
   assert.ok(ruleEvent(v,crossId).hard_bonus_eligibility);
  }
  v=matrixRun(pid,[cross],{[crossId]:allDates});
  assert.equal(v.evaluation.bonus.status,'NO_TRIGGER_FOUND');
 }
 const [cross,crossId]=crossHistories[0];
 v=matrixRun(pid,[name,cross],{[crossId]:{held_now:'YES'}});
 assert.equal(v.evaluation.bonus.status,'BONUS_INELIGIBLE');
 assert.equal(v.evaluation.application.status,'INSUFFICIENT_DATA');
 assert.ok(v.questionnaire.questionnaire.specific.some(q=>q.type==='marriott_multi'&&q.options.some(o=>o.value===id)),
  'bonus blocker must not suppress independent Chase product eligibility questions');
 const other=id==='chase_bountiful'?'Chase Marriott Bonvoy Bold / Boundless':'Chase Marriott Bonvoy Bountiful';
 v=matrixRun(pid,[other]);
 assert.equal(v.evaluation.bonus.status,'NO_TRIGGER_FOUND');
 assert.equal(v.evaluation.application.status,'MODEL_ONLY');
}
// Three equivalent Amex-history windows become two checkbox groups.
const three=crossHistories.slice(1).map(([label])=>label);
const threeIds=crossHistories.slice(1).map(([,id])=>id);
const combined=matrixRun('chase_marriott_bonvoy_boundless',three);
const grouped=combined.questionnaire.questionnaire.specific.filter(q=>q.type==='marriott_multi');
assert.deepEqual(grouped.map(q=>q.fact_field),['approved_within_90d','bonus_or_upgrade_within_24m']);
assert.ok(grouped.every(q=>JSON.stringify(q.options.map(o=>o.value))===JSON.stringify(threeIds)));
const partiallyAnswered=matrixRun('chase_marriott_bonvoy_boundless',three,{
 [threeIds[0]]:{approved_within_90d:'NO'},[threeIds[1]]:{approved_within_90d:'YES'}});
const ninety=partiallyAnswered.questionnaire.questionnaire.marriott_followups.find(q=>q.fact_field==='approved_within_90d');
assert.equal(ninety.options.length,3);
assert.deepEqual(ninety.options.map(o=>o.answered),[true,true,false],
 'adding a history cannot silently turn an unanswered option into NO');
assert.ok(ruleEvent(partiallyAnswered,threeIds[1]).trigger_sources.some(x=>x.question_id===ninety.id&&x.value===threeIds[1]));
const bountifulGroups=matrixRun('history_ot_chase_046',[
 'Chase Marriott Bonvoy Bountiful',...crossHistories.map(([label])=>label)
]).questionnaire.questionnaire.specific.filter(q=>q.type==='marriott_multi');
assert.deepEqual(bountifulGroups.map(q=>[q.fact_field,q.options.length]),[
 ['held_now',5],['approved_within_90d',4],['new_card_bonus_within_24m',1],['bonus_or_upgrade_within_24m',4]
],'current holding and separate new-card/upgrade windows must not be conflated');
const thirty=matrixRun('history_ot_chase_046',crossHistories.map(([label])=>label),
 Object.fromEntries(crossHistories.map(([,id])=>[id,{held_now:'NO'}])))
 .questionnaire.questionnaire.specific.find(q=>q.fact_field==='closed_within_30d');
assert.equal(thirty.options.length,4);
assert.equal(run('chase_aeroplan').marriott_matrix,null,'matrix stays scoped to Marriott');
const inkTargets=[
 ['history_ot_chase_071','Ink Business Cash','CHASE-005'],
 ['history_ot_chase_072','Ink Business Unlimited','CHASE-005'],
 ['history_ot_chase_082','Ink Business Preferred','CHASE-006'],
 ['chase_ink_business_premier','Ink Business Premier','CHASE-007'],
 ['history_ot_chase_070','Sapphire Reserve for Business','CHASE-008']
];
for(const [pid,value,id] of inkTargets){
 const pending=run(pid,{F03_CARD_HISTORY:undefined});
 const q=pending.questionnaire.questionnaire.specific.find(q=>q.id==='F03_CARD_HISTORY');
 assert.match(q.title,/以前办过/);
 assert.match(q.description,/没拿到开卡奖励/);
 assert.ok(q.options.some(x=>x.value===value));
 const v=run(pid,{F03_CARD_HISTORY:[value]}).evaluation;
 assert.equal(v.bonus.status,'LIKELY_RESTRICTED');
 assert.equal(v.application.status,'MODEL_ONLY');
 assert.ok(v.bonus.triggered_rules.includes(id));
 assert.ok(!v.application.triggered_rules.includes(id));
 assert.deepEqual(v.bonus.product_blocking_rules,[]);
 assert.equal(run(pid,{F03_CARD_HISTORY:['NONE']}).evaluation.bonus.status,'NO_TRIGGER_FOUND');
}
assert.equal(run('history_ot_chase_072',{F03_CARD_HISTORY:['Ink Business Preferred']}).evaluation.bonus.status,'NO_TRIGGER_FOUND');
assert.equal(run('history_ot_chase_082',{F03_CARD_HISTORY:['Ink Business Cash']}).evaluation.bonus.status,'NO_TRIGGER_FOUND');
const privateR=run(csp,{a2:'SENSITIVE_TEST_MARKER_DO_NOT_ECHO'});
assert.ok(!JSON.stringify(privateR).includes('SENSITIVE_TEST_MARKER_DO_NOT_ECHO'));
const amex=facade.plan({product_id:'amex_gold',known_facts:{a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0'}});
assert.equal(amex.evaluation.issuer,'AMEX');
assert.ok(!amex.evaluation.rule_results.some(x=>x.rule_id.startsWith('CHASE')));
console.log(JSON.stringify({suite:'chase-local-assessment',
  chaseProducts:chase.length,implementedRules:active.length,
  sameAmexUi:true,modelOnly:true,answersStayLocal:true,status:'PASS'}));
