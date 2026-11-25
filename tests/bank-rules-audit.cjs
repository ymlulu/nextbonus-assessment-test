// Independent expected cases derived from the reviewed Bank Rules and Special Matrix.
// Future rule additions require an explicit acceptance fixture, not generated expectations.
const fs=require('node:fs'),path=require('node:path');
const {createRuntime}=require('../engines/bank-rules-runtime.js');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const rulebook=read('bank-rules/rules.json'),factbook=read('bank-rules/facts.json'),products=read('bank-rules/products.json'),approval=read('bank-rules/approval.json'),ids=read('data/card-identity-index.json');
const runtime=createRuntime({rulebook,factbook,products,approval});
const assert=(v,label)=>{if(!v)throw Error(label);};
const eq=(a,b,label)=>assert(JSON.stringify(a)===JSON.stringify(b),label+': '+JSON.stringify(a)+' != '+JSON.stringify(b));
const base={a1:'Y2_PLUS',a2:'SCORE_740_PLUS',a3:'N0',a4:'N0',F01_RECENT_NEW_ACCOUNTS:0,F06_REPORTED_NEW_ACCOUNTS:0,
 F02_ISSUER_APPLICATION_HISTORY:{approved_chase_30d:0,approved_chase_business_30d:'NO',approved_revolving_90d:0,same_product_applied_or_approved_90d:'NO'},
 F03_CARD_HISTORY:['NONE'],F03_CURRENT_CARD_HISTORY:['NONE'],F04_BONUS_HISTORY:['NONE'],F04_EVER_BONUS_HISTORY:['NONE'],F07_MARRIOTT_HISTORY:['NONE'],
 F10_ISSUER_PORTFOLIO_COUNT:0,F10_CHARGE_PORTFOLIO_COUNT:0,schwab_relationship:'YES',morgan_stanley_relationship:'YES'};
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
eq([...coverage].sort(),rulebook.rules.map(r=>r.id).sort(),'every executable rule must have independent positive coverage');
console.log(JSON.stringify({suite:'bank-rules-audit',covered:coverage.size,matrix_cells:cells,fixture_only_products:fixtures.length,...counter,status:'PASS'}));
