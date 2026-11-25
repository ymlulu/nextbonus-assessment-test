// Independent expected cases derived from the reviewed Bank Rules and Special Matrix.
// Future rule additions require an explicit acceptance fixture, not generated expectations.
const fs=require('node:fs'),path=require('node:path');
const {createRuntime}=require('../engines/bank-rules-runtime.js');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const rulebook=read('bank-rules/rules.json'),factbook=read('bank-rules/facts.json'),products=read('bank-rules/products.json'),approval=read('bank-rules/approval.json'),ids=read('data/card-identity-index.json');
const runtime=createRuntime({rulebook,factbook,products,approval,messages:read('bank-rules/messages.zh-CN.json')});
const assert=(v,label)=>{if(!v)throw Error(label);};
const eq=(a,b,label)=>assert(JSON.stringify(a)===JSON.stringify(b),label+': '+JSON.stringify(a)+' != '+JSON.stringify(b));
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',recent_applications_6m:0,F01_RECENT_NEW_ACCOUNTS:0,F06_REPORTED_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:0,approved_chase_business_30d:'NO',approved_revolving_90d:0,same_product_applied_or_approved_90d:'NO',citi_personal_application_lt_8d:'NO',citi_applications_65d:0,citi_business_application_lt_90d:'NO',bofa_approved_2m:0,bofa_approved_12m:0,bofa_approved_24m:0,cap1_application_or_approval_lt_6m:'NO',cap1_applications_30d:0,wf_consumer_opened_lt_4m:'NO'},
 F03_CARD_HISTORY:['NONE'],F03_CURRENT_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F04_EVER_BONUS_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],
 F10_ISSUER_PORTFOLIO_COUNT:0,F10_CHARGE_PORTFOLIO_COUNT:0,schwab_relationship:'YES',morgan_stanley_relationship:'YES',F04_CITI_BONUS_48M:['NONE'],F05_CITI_CONVERSION_48M:['NONE'],F12_CITI_OPENING_OFFER_48M:['NONE'],costco_active_membership:'YES',F03_HELD_WITHIN_24M:['NONE'],bofa_business_held_24m:'NO',F04_BONUS_RECEIVED_48M:['NONE'],cap1_business_ever_held:'NO',cap1_open_accounts:0,F03_HELD_OR_OPENED_48M:['NONE'],F03_OPENED_AND_RECEIVED_BONUS_15M:['NONE'],F03_OPENED_WITHIN_48M:['NONE'],discover_current_cards:0,recent_new_accounts_6m:0,recent_new_accounts_12m:0,F04_BONUS_RECEIVED_60M:['NONE'],usb_cashplus_upgrade:'NO',bilt_decline_lt_45d:'NO'};
const catalog=ids.products.map(p=>({...p,...products.overrides[p.product_id]}));
const virtual=(name,business=false,lineage='NOT_UNITED_CLUB')=>({product_id:'fixture_'+name,product_name:name,issuer:'CHASE',product_type:'CREDIT_CARD',customer_type:business?'BUSINESS':'PERSONAL',product_lineage:lineage,card_form:'REVOLVING_CREDIT'});
const fixtures=[virtual('United Club',false,'UNITED_CLUB'),virtual('Iberia Visa'),virtual('Aer Lingus Visa'),virtual('Southwest Premier Business',true)];
const card=name=>[...catalog,...fixtures].find(p=>p.product_name===name);
const assess=(p,patch={},opts={})=>runtime.assess({product:p,answers:{...base,...patch},...opts});
const event=(res,id)=>res.evaluation.rule_results.find(r=>r.rule_id===id);
const coverage=new Set(),counter={trigger:0,clear:0,missing:0,scope:0,offer:0};
function check(id,p,patch,status,impacts=[0,0],actions=['CLEAR','CLEAR'],opts={}){
 assert(p,'missing product fixture '+id);
 const result=assess(p,patch,opts),e=event(result,id),label=id+' / '+p.product_name+' / '+status;
 if(status==='ABSENT'){eq(e,undefined,label);counter.scope++;return result;}
 assert(e,label+' event absent');
 eq(e.status,status,label);eq([e.application_impact,e.bonus_impact],impacts,label+' impact');
 eq([e.application_action,e.bonus_action],actions,label+' action');
 if(status==='TRIGGERED'){coverage.add(id);counter.trigger++;assert(e.trigger_sources?.length,label+' evidence missing');}
 if(status==='CLEAR')counter.clear++;
 if(status==='MISSING')counter.missing++;
 return result;
}
const app=(n,action='RISK')=>[[n,0],[action,'CLEAR']];
const bonus=(n,action='BLOCK')=>[[0,n],['CLEAR',action]];
const structured=(id,value)=>({F02_ISSUER_APPLICATION_HISTORY:{...base.F02_ISSUER_APPLICATION_HISTORY,[id]:value}});
const platinum=card('The Platinum Card'),csp=card('Chase Sapphire Preferred'),gold=card('Personal AMEX Gold'),revolving=card('Blue Cash Everyday'),cash=card('Ink Business Cash');
function numeric(id,p,patch,threshold,impact,action){
 for(const n of [threshold-1,threshold,threshold+1]){
  check(id,p,patch(n),n<threshold?'CLEAR':'TRIGGERED',...(n<threshold?[]:app(impact,action)));
 }
 check(id,p,patch(undefined),'MISSING');
}
numeric('AMEX-006',revolving,n=>structured('approved_revolving_90d',n),2,3,'WAIT');
numeric('AMEX-007',revolving,n=>({F10_ISSUER_PORTFOLIO_COUNT:n}),5,2,'RISK');
numeric('AMEX-008',platinum,n=>({F10_CHARGE_PORTFOLIO_COUNT:n}),10,1,'RISK');
numeric('CHASE-001',csp,n=>({F01_RECENT_NEW_ACCOUNTS:n}),5,3,'WAIT');
numeric('CHASE-002',csp,n=>structured('approved_chase_30d',n),2,3,'WAIT');
check('AMEX-006',platinum,{},'ABSENT');check('AMEX-007',platinum,{},'ABSENT');check('AMEX-008',revolving,{},'ABSENT');
check('CHASE-001',platinum,{},'ABSENT');check('CHASE-002',gold,{},'ABSENT');
check('CHASE-001',csp,{F06_REPORTED_NEW_ACCOUNTS:5},'REVIEW');
check('CHASE-001',csp,{F06_REPORTED_NEW_ACCOUNTS:undefined},'MISSING');
check('CHASE-001',card('Amazon Prime Visa'),{F01_RECENT_NEW_ACCOUNTS:5},'TRIGGERED',...app(2));
function binary(id,p,patch,yes,no,impacts,actions){
 check(id,p,patch(no),'CLEAR');check(id,p,patch(yes),'TRIGGERED',impacts,actions);check(id,p,patch(undefined),'MISSING');
}
binary('AMEX-011',platinum,x=>structured('same_product_applied_or_approved_90d',x),'YES','NO',...app(2));
binary('CHASE-012',cash,x=>structured('approved_chase_business_30d',x),'YES','NO',...app(2));
check('CHASE-012',csp,{},'ABSENT');
binary('AMEX-REL-001',card('Platinum for Charles Schwab'),x=>({schwab_relationship:x}),'NO','YES',...app(3,'BLOCK'));
binary('AMEX-REL-002',card('Platinum for Morgan Stanley'),x=>({morgan_stanley_relationship:x}),'NO','YES',...app(3,'BLOCK'));
const history=(id,p,fact,values,impacts,actions)=>{
 check(id,p,{[fact]:['NONE']},'CLEAR');
 check(id,p,{[fact]:undefined},'MISSING');
 check(id,p,{[fact]:['UNRELATED_HISTORY']},'CLEAR');
 for(const v of values)check(id,p,{[fact]:[v]},'TRIGGERED',impacts,actions);
};
const marriottMap={'Marriott Bonvoy Business American Express':'AMEX Marriott Bonvoy Business / Legacy SPG Business','Marriott Bonvoy Bevy':'AMEX Marriott Bonvoy Bevy','Marriott Bonvoy Brilliant':'AMEX Marriott Bonvoy Brilliant'};
for(const p of catalog.filter(p=>p.issuer==='AMEX')){
 const m=marriottMap[p.product_name],fact=m?'F07_MARRIOTT_HISTORY':'F03_CARD_HISTORY',value=m||p.product_name;
 history('AMEX-001',p,fact,[value],...bonus(3));
 check('AMEX-001',p,{[fact]:[value]},'ABSENT',[0,0],['CLEAR','CLEAR'],{offer_variant:'NLL'});
 counter.offer++;
}
const personalPlatinum=['The Platinum Card','Platinum for Charles Schwab','Platinum for Morgan Stanley'];
const delta=['Delta SkyMiles Blue (Personal)','Delta SkyMiles Gold (Personal)','Delta SkyMiles Platinum (Personal)','Delta SkyMiles Reserve (Personal)'];
const family=[
 ['AMEX-FL-001',personalPlatinum[0],personalPlatinum],
 ['AMEX-FL-002',personalPlatinum[1],personalPlatinum],
 ['AMEX-FL-003',personalPlatinum[2],personalPlatinum],
 ['AMEX-FL-004','Personal AMEX Gold',['Personal AMEX Gold','Premier Rewards Gold',...personalPlatinum]],
 ['AMEX-FL-005','Blue Cash Everyday',['Blue Cash Everyday','Cash Magnet','Blue Cash Preferred','Morgan Stanley Blue Cash Preferred']],
 ['AMEX-FL-006','Blue Cash Preferred',['Blue Cash Preferred','Morgan Stanley Blue Cash Preferred']],
 ['AMEX-FL-007',delta[0],[...delta,'Delta SkyMiles Options']],
 ['AMEX-FL-008',delta[1],delta.slice(1)],['AMEX-FL-009',delta[2],delta.slice(2)],['AMEX-FL-010',delta[3],delta.slice(3)],
 ['AMEX-BIZ-001','Business Platinum',['Business Platinum']],['AMEX-BIZ-002','Business Gold',['Business Gold']],
 ['AMEX-FL-012','Marriott Bonvoy Bevy',[marriottMap['Marriott Bonvoy Bevy'],marriottMap['Marriott Bonvoy Brilliant']]],
 ['AMEX-FL-013','Marriott Bonvoy Brilliant',[marriottMap['Marriott Bonvoy Brilliant']]],
 ['AMEX-BIZ-005','Marriott Bonvoy Business American Express',[marriottMap['Marriott Bonvoy Business American Express']]]
];
for(const [id,name,values] of family){
 const p=card(name),fact=marriottMap[name]?'F07_MARRIOTT_HISTORY':'F03_CARD_HISTORY';
 history(id,p,fact,values,...bonus(3));
 check(id,p,{[fact]:[values[0]]},'TRIGGERED',...bonus(3),{offer_variant:'NLL'});
 check(id,p,{[fact]:[values[0]]},'ABSENT',[0,0],['CLEAR','CLEAR'],{offer_rule_overrides:{[id]:'ABSENT'}});
 check(id,p,{[fact]:[values[0]]},'REVIEW',[0,0],['CLEAR','CLEAR'],{offer_facts:{}});
 check(id,csp,{},'ABSENT');counter.offer+=3;
}
for(const n of ['Chase Sapphire Preferred','Chase Sapphire Reserve'])history('CHASE-003',card(n),'F04_EVER_BONUS_HISTORY',[n],...bonus(3));
for(const n of ['Ink Business Cash','Ink Business Unlimited'])history('CHASE-005',card(n),'F03_CARD_HISTORY',['Ink Business Cash','Ink Business Unlimited'],...bonus(2,'RISK'));
check('CHASE-005',cash,{F03_CARD_HISTORY:['OTHER_CHASE_NO_FEE_BUSINESS']},'REVIEW');
for(const [id,n] of [['CHASE-006','Ink Business Preferred'],['CHASE-007','Ink Business Premier'],['CHASE-008','Sapphire Reserve for Business']])history(id,card(n),'F03_CARD_HISTORY',[n],...bonus(2,'RISK'));
const ihg=['IHG One Rewards Traveler','IHG One Rewards Premier'];
for(const n of ihg){
 history('CHASE-PROD-001',card(n),'F03_CURRENT_CARD_HISTORY',ihg,...app(3,'BLOCK'));
 history('CHASE-PROD-002',card(n),'F04_BONUS_HISTORY',ihg,...app(3,'WAIT'));
}
const southwest=['Southwest Plus','Southwest Premier','Southwest Priority'];
const combos=[
 ['CHASE-PROD-005',southwest,southwest],['CHASE-PROD-006',['World of Hyatt Personal']],['CHASE-PROD-007',['Chase Aeroplan Card']],
 ['CHASE-PROD-011',['Freedom Rise','Freedom Flex','Freedom Unlimited']],['CHASE-PROD-012',['United Gateway','United Explorer','United Quest']],
 ['CHASE-PROD-013',['United Club']],['CHASE-PROD-014',['British Airways Visa','Iberia Visa','Aer Lingus Visa']],
 ['CHASE-PROD-015',['World of Hyatt Business Credit Card']],['CHASE-PROD-016',['Southwest Premier Business','Southwest Performance Business']]
];
for(const [id,names,scope] of combos){
 const business=['CHASE-PROD-015','CHASE-PROD-016'].includes(id),effect=business?bonus:app;
 for(const n of names){
  const p=card(n),values=scope||[n];
  history(id,p,'F03_CURRENT_CARD_HISTORY',values,...effect(3,'BLOCK'));
  history(id,p,'F04_BONUS_HISTORY',values,...effect(3,'WAIT'));
  const both=check(id,p,{F03_CURRENT_CARD_HISTORY:[values[0]],F04_BONUS_HISTORY:[values[0]]},'TRIGGERED',...effect(3,'BLOCK'));
  eq(event(both,id).trigger_sources.length,2,id+' independent OR evidence');
  const one=check(id,p,{F03_CURRENT_CARD_HISTORY:[values[0]],F04_BONUS_HISTORY:undefined},'TRIGGERED',...effect(3,'BLOCK'));
  assert(event(one,id).pending_facts,id+' remaining unanswered OR condition');
 }
 check(id,platinum,{},'ABSENT');
}
history('CHASE-PROD-017',csp,'F03_CURRENT_CARD_HISTORY',['Chase Sapphire Preferred'],...app(3,'BLOCK'));
history('CHASE-PROD-018',card('Chase Sapphire Reserve'),'F03_CURRENT_CARD_HISTORY',['Chase Sapphire Reserve'],...app(3,'BLOCK'));
// Original 8 x 5 matrix; lifetime cells are implemented by the above AMEX rules.
const prior=[
 ['chase_bold_boundless','Chase Marriott Bonvoy Bold / Boundless','H24','OK','9024','H309024','9024'],
 ['chase_bountiful','Chase Marriott Bonvoy Bountiful','OK','H24','9024','H309024','9024'],
 ['chase_ritz_carlton','Chase Ritz-Carlton','OK','OK','OK','H30','H30'],
 ['chase_marriott_business_legacy','Chase Marriott Business（历史卡）','OK','OK','H30','H30','OK'],
 ['amex_marriott_legacy_personal','AMEX Marriott / Legacy SPG Personal','H30','H309024','OK','OK','OK'],
 ['amex_marriott_business',marriottMap['Marriott Bonvoy Business American Express'],'9024','H309024','LL','OK','OK'],
 ['amex_marriott_bevy',marriottMap['Marriott Bonvoy Bevy'],'9024','H309024','OK','LL','OK'],
 ['amex_marriott_brilliant',marriottMap['Marriott Bonvoy Brilliant'],'9024','H309024','OK','LL','LL']
];
const targets=[
 ['chase_bold_boundless',['Marriott Bonvoy Bold','Marriott Bonvoy Boundless']],
 ['chase_bountiful',['Marriott Bonvoy Bountiful']],
 ['Marriott_Bonvoy_Business_American_Express',['Marriott Bonvoy Business American Express']],
 ['Marriott_Bonvoy_Bevy',['Marriott Bonvoy Bevy']],
 ['Marriott_Bonvoy_Brilliant',['Marriott Bonvoy Brilliant']]
];
const no={held_now:'NO',closed_within_30d:'NO',approved_within_90d:'NO',new_card_bonus_within_24m:'NO',bonus_or_upgrade_within_24m:'NO'};
const detail=(pid,label,row)=>({F07_MARRIOTT_HISTORY:[label],F07_MARRIOTT_DETAILS:{[pid]:row}});
let cells=0;
for(const [pid,label,...cellsForPrior] of prior){
 for(let i=0;i<targets.length;i++){
  const [tid,names]=targets[i],type=cellsForPrior[i],id='MARRIOTT-MATRIX:'+pid+':'+tid;
  cells++;
  for(const n of names){
   const p=card(n);
   if(['OK','LL'].includes(type)){check(id,p,detail(pid,label,no),'ABSENT');continue;}
   const own=type==='H24',effect=own?app:bonus;
   check(id,p,{},'CLEAR');check(id,p,{F07_MARRIOTT_HISTORY:undefined},'MISSING');
   check(id,p,detail(pid,label,{}),'MISSING');check(id,p,detail(pid,label,no),'CLEAR');
   const positives=[];
   if(type.includes('H'))positives.push(['held_now','BLOCK']);
   if(type.includes('H30'))positives.push(['closed_within_30d','WAIT']);
   if(type.includes('90'))positives.push(['approved_within_90d','WAIT']);
   if(type.includes('24'))positives.push([own?'new_card_bonus_within_24m':'bonus_or_upgrade_within_24m','WAIT']);
   for(const [field,action] of positives)check(id,p,detail(pid,label,{...no,[field]:'YES'}),'TRIGGERED',...effect(3,action));
   if(own)check(id,p,detail(pid,label,{...no,bonus_or_upgrade_within_24m:'YES'}),'CLEAR');
   if(type.includes('H30')){
    const held=assess(p,detail(pid,label,{...no,held_now:'YES'}));
    const close=held.questionnaire.editable.find(q=>q.id==='F07_MARRIOTT_GROUP:closed_within_30d');
    assert(!close?.options.some(o=>o.value===pid),id+' no closed-date question while currently held');
   }
  }
 }
}
eq(cells,40,'matrix cells checked');
// Real combined case: a finite same-product WAIT must not erase a separate bonus BLOCK.
const mixed=assess(card('Marriott Bonvoy Bountiful'),{F07_MARRIOTT_HISTORY:['Chase Marriott Bonvoy Bountiful','AMEX Marriott / Legacy SPG Personal'],
 F07_MARRIOTT_DETAILS:{chase_bountiful:{...no,new_card_bonus_within_24m:'YES'},amex_marriott_legacy_personal:{...no,held_now:'YES'}}});
eq(mixed.evaluation.application.action,'WAIT','application finite gate');
eq(mixed.evaluation.bonus.action,'BLOCK','independent bonus blocker wins');
eq(mixed.evaluation.bonus.impact,3,'hard bonus impact');
const partial=assess(card('Chase Aeroplan Card'),{F03_CURRENT_CARD_HISTORY:['Chase Aeroplan Card'],F04_BONUS_HISTORY:undefined});
eq(partial.evaluation.application.complete,false,'unfinished OR application');
eq(partial.evaluation.bonus.complete,false,'unfinished projected bonus');
eq(partial.evaluation.application.action,'BLOCK','known blocker remains');

// Citi: independent expected cases from the reviewed 17 executable rules.
const elite=card('Citi Strata Elite'),business=card('Citi / AAdvantage Business'),globe=card('Citi / AAdvantage Globe'),strata=card('Citi Strata'),premier=card('Citi Strata Premier'),att=card('AT&T Points Plus Card');
const cb='F04_CITI_BONUS_48M',cc='F05_CITI_CONVERSION_48M',opening='F12_CITI_OPENING_OFFER_48M';
binary('CITI-001',elite,x=>structured('citi_personal_application_lt_8d',x),'YES','NO',...app(2));
check('CITI-001',business,{},'ABSENT');
numeric('CITI-002',elite,n=>structured('citi_applications_65d',n),2,3,'WAIT');
numeric('CITI-002',business,n=>structured('citi_applications_65d',n),2,3,'WAIT');
binary('CITI-003',business,x=>structured('citi_business_application_lt_90d',x),'YES','NO',...app(3,'WAIT'));
check('CITI-003',elite,{},'ABSENT');
history('CITI-004',elite,cb,['Citi Strata Elite'],...bonus(3,'WAIT'));
history('CITI-005',elite,cc,['Citi Strata Elite'],...bonus(3,'WAIT'));
for(const [id,names] of [
 ['CITI-PROD-001',['Citi Strata','Citi Strata Student','Citi Rewards+','Citi Rewards+ Student']],
 ['CITI-PROD-003',['Citi / AAdvantage Platinum Select']],
 ['CITI-PROD-004',['Citi / AAdvantage Executive']],
 ['CITI-PROD-005',['Citi / AAdvantage Globe']],
 ['CITI-PROD-006',['AAdvantage MileUp']],
 ['CITI-PROD-007',['Citi / AAdvantage Business']],
 ['CITI-PROD-008',['Citi Strata Premier','Citi Premier']],
 ['CITI-PROD-009',['Citi Strata Elite']],
 ['CITI-PROD-010',['Citi Double Cash']]
]){
 for(const name of names){
  const p=card(name)||{product_id:'fixture_'+name,product_name:name,issuer:'CITI',product_type:'CREDIT_CARD',customer_type:'PERSONAL'};
  history(id,p,cb,names,...bonus(3,'WAIT'));
  history(id,p,cc,names,...bonus(3,'WAIT'));
  const result=check(id,p,{[cb]:[names[0]],[cc]:[names[0]]},'TRIGGERED',...bonus(3,'WAIT'));
  eq(event(result,id).trigger_sources.length,2,id+' distinct bonus and conversion evidence');
  const partial=check(id,p,{[cb]:[names[0]],[cc]:undefined},'TRIGGERED',...bonus(3,'WAIT'));
  assert(event(partial,id).pending_facts,id+' incomplete conversion');
  check(id,p,{[cb]:[names[0]]},'ABSENT',[0,0],['CLEAR','CLEAR'],{offer_rule_overrides:{[id]:'ABSENT'}});
  check(id,p,{},'REVIEW',[0,0],['CLEAR','CLEAR'],{offer_facts:{}});
  counter.offer+=2;
 }
 check(id,csp,{},'ABSENT');
}
// Do not infer a bank-wide AA or Strata family.
eq(assess(globe,{[cb]:['Citi / AAdvantage Platinum Select']}).evaluation.bonus.action,'CLEAR','AA Platinum does not restrict Globe');
eq(assess(elite,{[cb]:['Citi Strata Premier'],[cc]:['Citi Strata Premier']}).evaluation.bonus.action,'CLEAR','Premier does not restrict Elite');
eq(assess(premier,{[cb]:['Citi Premier']}).evaluation.bonus.action,'WAIT','legacy Premier restricts Strata Premier');
eq(assess(strata,{[cb]:['Citi Rewards+ Student']}).evaluation.bonus.action,'WAIT','Strata family includes legacy Rewards+ Student');
eq(assess(elite,{[cc]:['Citi Strata Elite'],[cb]:['NONE']}).evaluation.bonus.action,'WAIT','conversion uses original bonus receipt window');
eq(assess(elite,{[cc]:['NONE'],[cb]:['NONE'],citi_conversion_date:'2026-11-01'}).evaluation.bonus.action,'CLEAR','recent conversion alone cannot trigger');
const exactAbsent={offer_facts:{rule_clause_state:{'CITI-004':'ABSENT','CITI-005':'ABSENT','CITI-PROD-009':'ABSENT'}}};
eq(assess(elite,{[cb]:['Citi Strata Elite'],[cc]:['Citi Strata Elite']},exactAbsent).evaluation.bonus.action,'CLEAR','exact offer omits clauses');
const unresolved=assess(elite,{}, {offer_facts:{}});
eq(unresolved.evaluation.bonus.action,'UNKNOWN','unknown exact clauses stay unknown');
assert(!unresolved.questionnaire.editable.some(q=>[cb,cc].includes(q.id)),'unknown offer gate is not a user fact');
for(const name of ['Costco Anywhere Visa Card','Costco Anywhere Visa Business Card']){
 const p=card(name);
 binary('CITI-REL-001',p,x=>({costco_active_membership:x}),'NO','YES',...app(3,'BLOCK'));
 eq(assess(p,{costco_active_membership:'NO'}).evaluation.bonus.action,'BLOCK','membership product gate');
 eq(assess(p).evaluation.bonus.action,'UNKNOWN','Costco unverified offer clauses remain unknown');
}
history('CITI-PROD-014',att,'F03_CURRENT_CARD_HISTORY',['AT&T Points Plus Card'],...app(3,'BLOCK'));
history('CITI-PROD-015',att,opening,['AT&T Points Plus Card'],...bonus(3,'WAIT'));
eq(assess(att,{[cb]:['AT&T Points Plus Card']}).evaluation.bonus.action,'CLEAR','AT&T opening offer anchor is distinct from bonus receipt');
eq(assess(att,{F03_CARD_HISTORY:['AT&T Points Plus Card']}).evaluation.application.action,'CLEAR','one-account restriction is current holding only');
check('CITI-PROD-015',att,{[opening]:['AT&T Points Plus Card']},'ABSENT',[0,0],['CLEAR','CLEAR'],{offer_rule_overrides:{'CITI-PROD-015':'ABSENT'}});
assert(!assess(att).questionnaire.editable.some(q=>[cb,cc].includes(q.id)),'AT&T does not reuse bonus receipt');
for(const p of catalog.filter(p=>p.issuer==='CITI')){
 const q=assess(p).questionnaire.editable.find(q=>q.id==='F02_ISSUER_APPLICATION_HISTORY');
 eq(q.fields.find(f=>f.id==='citi_applications_65d').count_bands,[{value:0,label:'0–1 次'},{value:2,label:'2 次或更多'}],'application count uses attempts');
 eq(q.fields.some(f=>f.id==='citi_personal_application_lt_8d'),p.customer_type==='PERSONAL','personal scope');
 eq(q.fields.some(f=>f.id==='citi_business_application_lt_90d'),p.customer_type==='BUSINESS','business scope');
}


// Remaining seven issuer/brand families, independently reviewed against the source rows.
// Known exact offer clauses are passed in tests rather than inferred from a user profile.
const clause=(id,state='PRESENT',limits={})=>({offer_facts:{rule_clause_state:{[id]:state},rule_limits:limits}});
const gatedBinary=(id,p,patch,positive,negative,impacts,actions)=>{
 check(id,p,patch(negative),'CLEAR',[0,0],['CLEAR','CLEAR'],clause(id));
 check(id,p,patch(positive),'TRIGGERED',impacts,actions,clause(id));
 check(id,p,patch(undefined),'MISSING',[0,0],['CLEAR','CLEAR'],clause(id));
 check(id,p,patch(positive),'ABSENT',[0,0],['CLEAR','CLEAR'],clause(id,'ABSENT'));
 check(id,p,patch(positive),'REVIEW',[0,0],['CLEAR','CLEAR'],{offer_facts:{}});
};
const gatedHistory=(id,p,fact,value,impacts,actions)=>{
 gatedBinary(id,p,x=>({[fact]:x}),[value],['NONE'],impacts,actions);
 check(id,p,{[fact]:['UNRELATED_HISTORY']},'CLEAR',[0,0],['CLEAR','CLEAR'],clause(id));
};
const ascent=card('Atmos Rewards Ascent'),summit=card('Atmos Rewards Summit'),bofaBiz=card('Atmos Rewards Business'),bofaPremium=card('Premium Rewards');
for(const p of [ascent,bofaBiz]){
 for(const [field,n] of [['bofa_approved_2m',2],['bofa_approved_12m',3],['bofa_approved_24m',4]])
  {
   const keys=['bofa_approved_2m','bofa_approved_12m','bofa_approved_24m'],idx=keys.indexOf(field);
   const patch=x=>({F02_ISSUER_APPLICATION_HISTORY:{...base.F02_ISSUER_APPLICATION_HISTORY,
    ...Object.fromEntries(keys.map((k,i)=>[k,i===idx?x:i<idx?0:(x??0)]))}});
   for(const x of [n-1,n,n+1])check('BOFA-001',p,patch(x),x<n?'CLEAR':'TRIGGERED',...(x<n?[]:app(3,'WAIT')));
   check('BOFA-001',p,patch(undefined),'MISSING');
  }
}
gatedHistory('BOFA-002',bofaPremium,'F03_HELD_WITHIN_24M','Premium Rewards',...app(2));
check('BOFA-002',bofaBiz,{},'ABSENT');
gatedBinary('BOFA-003',bofaBiz,x=>({bofa_business_held_24m:x}),'YES','NO',...app(2));
check('BOFA-003',ascent,{},'ABSENT');
history('BOFA-PROD-002',ascent,'F03_HELD_WITHIN_24M',['Atmos Rewards Ascent'],...app(2));
check('BOFA-PROD-002',ascent,{F03_HELD_WITHIN_24M:['Atmos Rewards Summit']},'CLEAR');
check('BOFA-PROD-002',summit,{F03_HELD_WITHIN_24M:['Atmos Rewards Ascent']},'ABSENT');
check('BOFA-PROD-001',summit,{},'REVIEW');
eq(assess(summit,{}, {offer_facts:{rule_clause_state:{'BOFA-002':'ABSENT'},coverage_state:{'BOFA-PROD-001':'CONFIRMED_NO_ADDITIONAL_RULES'}}}).evaluation.bonus.action,'CLEAR','reviewed Summit coverage');
const vx=card('Capital One Venture X'),venture=card('Capital One Venture'),ventureOne=card('Capital One VentureOne'),spark=card('Spark Cash Plus'),capSavor=card('Savor');
for(const p of [vx,spark])binary('CAP1-001',p,x=>structured('cap1_application_or_approval_lt_6m',x),'YES','NO',...app(1));
numeric('CAP1-002',vx,x=>structured('cap1_applications_30d',x),2,3,'WAIT');
check('CAP1-002',spark,structured('cap1_applications_30d',2),'REVIEW');
gatedBinary('CAP1-002',spark,x=>structured('cap1_applications_30d',x),2,1,...app(3,'WAIT'));
gatedHistory('CAP1-003',capSavor,'F04_BONUS_RECEIVED_48M','Savor',...bonus(3,'WAIT'));
check('CAP1-003',spark,{},'ABSENT');
const vc=['Capital One VentureOne','Capital One Venture','Capital One Venture X'];
for(let i=0;i<vc.length;i++){
 const p=[ventureOne,venture,vx][i];
 history('CAP1-004',p,'F04_BONUS_RECEIVED_48M',vc.slice(i),...bonus(3,'WAIT'));
 for(const other of vc.slice(0,i))check('CAP1-004',p,{F04_BONUS_RECEIVED_48M:[other]},'CLEAR');
 eq(assess(p).questionnaire.editable.find(q=>q.id==='F04_BONUS_RECEIVED_48M').options.map(o=>o.value).sort(),vc.slice(i).sort(),'directional questionnaire scope');
}
gatedBinary('CAP1-005',spark,x=>({cap1_business_ever_held:x}),'YES','NO',...bonus(2,'RISK'));
check('CAP1-005',vx,{},'ABSENT');
check('CAP1-007',vx,{cap1_open_accounts:99},'ABSENT');
check('CAP1-007',spark,{cap1_open_accounts:99},'REVIEW');
for(const n of [5,6]){
 const opts=clause('CAP1-007','PRESENT',{'CAP1-007':n});
 const q=assess(spark,{},opts).questionnaire.editable.find(q=>q.id==='cap1_open_accounts');
 eq(q.count_bands.map(b=>b.value),[0,n],'exact offer account cap bands');
 check('CAP1-007',spark,{cap1_open_accounts:n-1},'CLEAR',[0,0],['CLEAR','CLEAR'],opts);
 check('CAP1-007',spark,{cap1_open_accounts:n},'TRIGGERED',...app(3,'BLOCK'),opts);
 check('CAP1-007',spark,{cap1_open_accounts:n+1},'TRIGGERED',...app(3,'BLOCK'),opts);
 check('CAP1-007',spark,{cap1_open_accounts:undefined},'MISSING',[0,0],['CLEAR','CLEAR'],opts);
}
for(const invalid of [undefined,0,-1,1.5,'5']){
 const r=check('CAP1-007',spark,{cap1_open_accounts:99},'REVIEW',[0,0],['CLEAR','CLEAR'],clause('CAP1-007','PRESENT',{'CAP1-007':invalid}));
 assert(!r.questionnaire.editable.some(q=>q.id==='cap1_open_accounts'),'unverified cap must not generate user question');
}
const wfActive=card('Wells Fargo Active Cash'),wfAuto=card('Wells Fargo Autograph'),wfJourney=card('Wells Fargo Autograph Journey'),wfBiz=card('Signify Business Cash');
for(const p of [wfActive,wfAuto,wfJourney])binary('WF-001',p,x=>structured('wf_consumer_opened_lt_4m',x),'YES','NO',...app(2));
check('WF-001',wfBiz,{},'ABSENT');
for(const id of ['COVERAGE-WF-BUSINESS-APPLICATION','COVERAGE-WF-BUSINESS-BONUS']){
 check(id,wfBiz,{},'REVIEW');
 check(id,wfActive,{},'ABSENT');
}
const wfBizUnknown=assess(wfBiz);
eq(wfBizUnknown.questionnaire.editable.filter(q=>q.section==='specific').length,0,'no fabricated WF business facts');
eq(wfBizUnknown.evaluation.application.action,'UNKNOWN','business application coverage gap');
eq(wfBizUnknown.evaluation.bonus.action,'UNKNOWN','business bonus coverage gap');
eq(wfBizUnknown.evaluation.decision.code,'REVIEW','no false clear on uncovered product');
const wfBizReviewed=assess(wfBiz,{}, {offer_facts:{coverage_state:{
 'COVERAGE-WF-BUSINESS-APPLICATION':'CONFIRMED_NO_ADDITIONAL_RULES',
 'COVERAGE-WF-BUSINESS-BONUS':'CONFIRMED_NO_ADDITIONAL_RULES'}}});
eq(wfBizReviewed.evaluation.decision.code,'CLEAR','explicit reviewed coverage resolves absence of rules');
for(const [id,p] of [['WF-PROD-001',wfActive],['WF-PROD-002',wfAuto],['WF-PROD-003',wfJourney]]){
 history(id,p,'F03_HELD_OR_OPENED_48M',[p.product_name],...bonus(2,'RISK'));
 check(id,p,{F04_BONUS_RECEIVED_48M:[p.product_name]},'CLEAR');
}
const choiceNames=['Choice Privileges Mastercard','Choice Privileges Select Mastercard'],oneNames=['One Key Card','One Key+ Card','Hotels.com Card'];
for(const name of choiceNames){
 const p=card(name);
 history('WF-PROD-004',p,'F03_CURRENT_CARD_HISTORY',choiceNames,...app(2));
 history('WF-PROD-005',p,'F03_OPENED_AND_RECEIVED_BONUS_15M',choiceNames,...bonus(2,'RISK'));
 check('WF-PROD-005',p,{F03_OPENED_WITHIN_48M:[name],F04_BONUS_RECEIVED_48M:[name]},'CLEAR');
}
const one=card(oneNames[0]),onePlus=card(oneNames[1]);
history('WF-PROD-006',one,'F03_CURRENT_CARD_HISTORY',oneNames,...app(3,'BLOCK'));
history('WF-PROD-007',onePlus,'F03_CURRENT_CARD_HISTORY',oneNames,...app(2));
check('WF-PROD-006',onePlus,{},'ABSENT');check('WF-PROD-007',one,{},'ABSENT');
for(const p of [one,onePlus]){
 history('WF-PROD-008',p,'F03_OPENED_WITHIN_48M',oneNames,...bonus(2,'RISK'));
 check('WF-PROD-008',p,{F04_BONUS_RECEIVED_48M:[p.product_name]},'CLEAR');
}
const discover=card('Discover it Cash Back');
numeric('DISC-001',discover,x=>({discover_current_cards:x}),2,3,'BLOCK');
gatedHistory('DISC-003',discover,'F04_BONUS_RECEIVED_48M',discover.product_name,...bonus(2,'RISK'));
for(const id of ['CAP1-001','CAP1-002','CAP1-003','CAP1-007'])check(id,discover,{},'ABSENT');
check('DISC-001',vx,{},'ABSENT');
const barc=card('Wyndham Earner');
numeric('BARC-001',barc,x=>({F01_RECENT_NEW_ACCOUNTS:x}),6,2,'RISK');
check('BARC-002',barc,{},'REVIEW');
eq(assess(barc,{F03_CARD_HISTORY:['Wyndham Earner Plus']}).evaluation.bonus.action,'UNKNOWN','unverified cross-product history must not create a hard block');
eq(assess(barc,{}, {offer_facts:{coverage_state:{'BARC-002':'CONFIRMED_NO_ADDITIONAL_RULES'}}}).evaluation.bonus.action,'CLEAR','explicit coverage state');
const usbGo=card('U.S. Bank Altitude Go Visa Signature'),usbConnect=card('U.S. Bank Altitude Connect Visa Signature'),usbCash=card('U.S. Bank Cash+ Visa Signature'),usbSmart=card('Smartly');
numeric('USB-001',usbGo,x=>({recent_new_accounts_6m:x,recent_new_accounts_12m:x===undefined?1:x<2?1:2}),1,1,'RISK');
numeric('USB-001',usbGo,x=>({recent_new_accounts_12m:x}),2,1,'RISK');
history('USB-PROD-002',usbGo,'F04_BONUS_RECEIVED_60M',[usbGo.product_name],...bonus(3,'WAIT'));
history('USB-PROD-003',usbConnect,'F04_BONUS_RECEIVED_60M',[usbConnect.product_name],...bonus(3,'WAIT'));
check('USB-PROD-002',usbGo,{F04_BONUS_RECEIVED_48M:[usbGo.product_name]},'CLEAR');
history('USB-PROD-004',usbCash,'F03_CARD_HISTORY',['U.S. Bank Cash Rewards Visa'],...bonus(3,'BLOCK'));
binary('USB-PROD-004',usbCash,x=>({usb_cashplus_upgrade:x}),'YES','NO',...bonus(3,'BLOCK'));
check('USB-PROD-004',usbCash,{F03_CARD_HISTORY:['Smartly']},'CLEAR');
check('USB-002',usbSmart,{},'REVIEW');check('USB-002',usbGo,{},'ABSENT');
const biltNames=['Bilt Blue','Bilt Obsidian','Bilt Palladium'];
for(const name of biltNames){
 const p=card(name);
 history('BILT-001',p,'F03_CARD_HISTORY',biltNames,...bonus(3,'BLOCK'));
 history('BILT-001',p,'F04_EVER_BONUS_HISTORY',biltNames,...bonus(3,'BLOCK'));
 check('BILT-001',p,{F03_CARD_HISTORY:['Legacy Wells Fargo Bilt'],F04_EVER_BONUS_HISTORY:['Legacy Wells Fargo Bilt']},'CLEAR');
 binary('BILT-003',p,x=>({bilt_decline_lt_45d:x}),'YES','NO',...app(3,'WAIT'));
}
check('BILT-001',wfActive,{},'ABSENT');
check('BILT-003',wfActive,{},'ABSENT');

eq([...coverage].sort(),rulebook.rules.map(r=>r.id).sort(),'every executable rule must have independent positive coverage');
console.log(JSON.stringify({suite:'bank-rules-audit',covered:coverage.size,matrix_cells:cells,fixture_only_products:fixtures.length,...counter,status:'PASS'}));
