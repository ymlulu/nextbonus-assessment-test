/* Pure typed Bank Rules interpreter. No issuer-specific rule logic, I/O or persistence. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextBonusBankRulesRuntime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const OPS=new Set(['gte','gt','lt','lte','eq','includes_any']);
const ACTIONS=new Set(['WAIT','BLOCK']);
const uniq=a=>[...new Set(a)];
const validCount=x=>Number.isSafeInteger(x)&&x>=0;
const countRange=x=>validCount(x)?[x,x]:
 x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===2&&validCount(x.min)&&
 (x.max===null||validCount(x.max)&&x.max>=x.min)?[x.min,x.max===null?Infinity:x.max]:null;
function countPredicate(raw,op,t){
 const range=countRange(raw);if(!range||!validCount(t))return null;
 const [lo,hi]=range;
 switch(op){
  case 'gte':return lo>=t?true:hi<t?false:null;
  case 'gt':return lo>t?true:hi<=t?false:null;
  case 'lt':return hi<t?true:lo>=t?false:null;
  case 'lte':return hi<=t?true:lo>t?false:null;
  case 'eq':return lo===t&&hi===t?true:t<lo||t>hi?false:null;
  default:return null;
 }
}
const knownList=x=>Array.isArray(x)&&x.length>0&&!x.includes('UNKNOWN')&&
 (!x.includes('NONE')||x.length===1)&&x.every(v=>typeof v==='string');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const empty=x=>x===undefined||x===null||x===''||x==='UNKNOWN';
const resolved=(values,p)=>uniq(values.map(v=>v==='$TARGET'?p.product_name:v).filter(Boolean));
const groupKey=(f,field)=>f.group_prefix+':'+field;
const validImpact=x=>Number.isInteger(x)&&x>=0&&x<=3;
function targetState(target,p){
 let unknown=false;
 for(const [k,v] of Object.entries(target)){
  if(p[k]===undefined||p[k]===null||p[k]===''){unknown=true;continue;}
  if(Array.isArray(v)?!v.includes(p[k]):v!==p[k])return false;
 }
 return unknown?null:true;
}
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const uniqueStrings=x=>Array.isArray(x)&&x.length>0&&x.every(nonempty)&&new Set(x).size===x.length;
const allowedKeys=(obj,keys)=>isObject(obj)&&Object.keys(obj).every(k=>keys.includes(k));
const TARGET_FIELDS=['issuer','approval_issuer','product_type','customer_type','card_form','product_name','product_lineage','product_id','brand','generation'];
function validate({rulebook,factbook,products,approval}){
 if(!nonempty(rulebook?.version)||!uniqueStrings(rulebook.supported_issuers)||!Array.isArray(rulebook.rules)||!isObject(factbook?.facts)||
    !isObject(products?.overrides)||!isObject(approval?.base_matrix)||!Array.isArray(approval.activity_facts)||!Array.isArray(approval.activity_bands))
  throw Error('BANK_RULES_DATA_REQUIRED');
 const defs=factbook.facts,ids=new Set(),answerKeys=new Set(),groupTitles=new Map();
 const allowedTypes=['number','single','multi','grouped_multi'];
 const fail=(code,id)=>{throw Error(code+' '+id)};
 for(const [id,f] of Object.entries(defs)){
  if(!nonempty(id)||!isObject(f)||!allowedTypes.includes(f.type)||!nonempty(f.title))
   fail('INVALID_FACT_DEFINITION',id);
  if(f.window&&(!allowedKeys(f.window,['unit','value'])||!['day','month','year'].includes(f.window.unit)||!Number.isSafeInteger(f.window.value)||f.window.value<1))
   fail('INVALID_FACT_WINDOW',id);
  if(own(f,'count_unit')&&(f.type!=='number'||!nonempty(f.count_unit)))fail('INVALID_COUNT_UNIT',id);
  if(f.type==='single'){
   if(!Array.isArray(f.options)||!f.options.length||f.options.some(o=>!nonempty(o.value)||!nonempty(o.label))||new Set(f.options.map(o=>o.value)).size!==f.options.length)
    fail('INVALID_FACT_OPTIONS',id);
  }
  if(f.group){
   if(!['number','single'].includes(f.type)||!nonempty(f.group)||!nonempty(f.group_title)||f.answer_key)
    fail('INVALID_FACT_GROUP',id);
   const previous=groupTitles.get(f.group)||new Set();previous.add(f.group_title);groupTitles.set(f.group,previous);
  }
  if(f.type==='grouped_multi'){
   const h=defs[f.history_id];
   if(!nonempty(f.details_id)||!nonempty(f.group_prefix)||h?.type!=='multi'||h.details_id!==f.details_id||!isObject(h.options_by_value))
    fail('INVALID_GROUPED_FACT',id);
   if(f.clear_when_not_no&&(!uniqueStrings(f.clear_when_not_no)||f.clear_when_not_no.some(k=>k===id||defs[k]?.details_id!==f.details_id||defs[k]?.type!=='grouped_multi')))
    fail('INVALID_GROUPED_DEPENDENCY',id);
  }else if(f.options_by_value){
   if(f.type!=='multi'||!isObject(f.options_by_value)||Object.entries(f.options_by_value).some(([v,o])=>!nonempty(v)||!nonempty(o.label)||!nonempty(o.prior_id))||
      new Set(Object.values(f.options_by_value).map(o=>o.prior_id)).size!==Object.keys(f.options_by_value).length)
    fail('INVALID_HISTORY_OPTIONS',id);
  }
  const key=f.type==='grouped_multi'?f.details_id+'.'+id:f.group?f.group+'.'+id:f.answer_key||id;
  if(!nonempty(key)||answerKeys.has(key))fail('DUPLICATE_FACT_ANSWER_KEY',id);
  answerKeys.add(key);
 }
 // All base-model inputs reference the same typed fact library as bank rules.
 const baseIds=[approval.age_fact,approval.score_fact,...approval.activity_facts];
 if(!uniqueStrings(baseIds)||defs[approval.age_fact]?.type!=='single'||defs[approval.score_fact]?.type!=='single'||
    !approval.activity_facts.length||approval.activity_facts.some(id=>defs[id]?.type!=='number')||
    baseIds.some(id=>defs[id].group||defs[id].answer_key))
  fail('INVALID_APPROVAL_FACTS','approval');
 for(const [id,map] of [[approval.age_fact,approval.age_map],[approval.score_fact,approval.score_map]]){
  if(!isObject(map)||defs[id].options.some(o=>o.value!=='UNKNOWN'&&!nonempty(map[o.value])))fail('INVALID_APPROVAL_MAP',id);
 }
 if(!Array.isArray(approval.activity_levels)||!approval.activity_bands.length||approval.activity_bands[0].min!==0||
    approval.activity_bands.some((b,i)=>!validCount(b.min)||b.min>=Number.MAX_SAFE_INTEGER||
      !Number.isInteger(b.level)||b.level<0||b.level>=approval.activity_levels.length||
      i>0&&(b.min<=approval.activity_bands[i-1].min||b.level<=approval.activity_bands[i-1].level)))
  fail('INVALID_APPROVAL_BANDS','approval');
 const relations=factbook.count_relations||[];
 if(!Array.isArray(relations))fail('INVALID_COUNT_RELATIONS','facts');
 for(const r of relations){
  if(!allowedKeys(r,['shorter','longer','message'])||!nonempty(r.message))fail('INVALID_COUNT_RELATION','facts');
  const s=defs[r.shorter],l=defs[r.longer];
  if(s?.type!=='number'||l?.type!=='number'||!nonempty(s.metric)||s.metric!==l.metric||
     !nonempty(s.population)||s.population!==l.population||!s.window||!l.window||
     s.window.unit!==l.window.unit||s.window.value>=l.window.value)
   fail('INVALID_COUNT_RELATION',r.shorter);
 }
 function scope(s,id,{requireIssuer=false,allowArrays=true}={}){
  if(!allowedKeys(s,TARGET_FIELDS)||!Object.keys(s).length||requireIssuer&&!nonempty(s.issuer)&&!uniqueStrings(s.issuer))
   fail('INVALID_TARGET_SCOPE',id);
  for(const [key,value] of Object.entries(s)){
   if(!nonempty(value)&&!(allowArrays&&uniqueStrings(value)))fail('INVALID_TARGET_VALUE',id+':'+key);
  }
  if(s.issuer&&![s.issuer].flat().every(i=>rulebook.supported_issuers.includes(i)))fail('UNKNOWN_TARGET_ISSUER',id);
 }
 function scenarios(s,r){
  if(!r.offer_clause||!isObject(s)||!Object.keys(s).length||Object.values(s).some(x=>!['PRESENT','ABSENT'].includes(x)))fail('INVALID_OFFER_SCENARIO',r.id);
 }
 function effect(e,id){
  if(!allowedKeys(e,['application','bonus','application_action','bonus_action','product_gate'])||!validImpact(e.application)||!validImpact(e.bonus)||!(e.application||e.bonus))
   fail('RULE_REQUIRES_NONZERO_IMPACT',id);
  for(const [dim,key] of [['application','application_action'],['bonus','bonus_action']])
   if(own(e,key)&&(!ACTIONS.has(e[key])||e[dim]!==3))fail('INVALID_HARD_ACTION',id);
  if(own(e,'product_gate')&&(typeof e.product_gate!=='boolean'||e.product_gate&&e.application!==3))fail('PRODUCT_GATE_REQUIRES_HARD_APPLICATION',id);
 }
 function condition(node,r,depth=0){
  if(depth>32||!isObject(node))fail('INVALID_CONDITION',r.id);
  if(own(node,'any')||own(node,'all')){
   const children=node.any||node.all;
   if(!allowedKeys(node,['any','all'])||Object.keys(node).length!==1||!Array.isArray(children)||!children.length)
    fail('INVALID_COMPOUND_CONDITION',r.id);
   children.forEach(n=>condition(n,r,depth+1));return;
  }
  if(!allowedKeys(node,['fact','op','value','values','value_from','action','prior','legacy']))
   fail('UNKNOWN_CONDITION_FIELD',r.id);
  const f=defs[node.fact];
  if(!f||!OPS.has(node.op))fail('UNKNOWN_CONDITION',r.id);
  if(own(node,'action')&&!ACTIONS.has(node.action))fail('INVALID_ACTION',r.id);
  if(f.type==='grouped_multi'){
   if(!nonempty(node.prior)||!Object.values(defs[f.history_id].options_by_value).some(o=>o.prior_id===node.prior))
    fail('UNKNOWN_GROUPED_PRIOR',r.id);
  }else if(own(node,'prior'))fail('UNEXPECTED_GROUPED_PRIOR',r.id);
  if(node.op==='includes_any'){
   if(f.type!=='multi'||!uniqueStrings(node.values)||node.values.some(v=>['NONE','UNKNOWN'].includes(v))||own(node,'value')||own(node,'value_from'))
    fail('INVALID_HISTORY_SCOPE',r.id);
   if(f.options_by_value&&node.values.some(v=>!own(f.options_by_value,v)))fail('UNKNOWN_HISTORY_OPTION',r.id);
   if(own(node,'legacy')&&(!uniqueStrings(node.legacy)||node.legacy.some(v=>!node.values.includes(v))))fail('INVALID_LEGACY_SCOPE',r.id);
  }else if(f.type==='number'){
   if(own(node,'values')||own(node,'legacy')||(own(node,'value')===own(node,'value_from')))
    fail('INVALID_THRESHOLD',r.id);
   if(node.value_from==='offer_limit'){
    if(!r.offer_clause||node.op!=='gte')fail('INVALID_OFFER_THRESHOLD',r.id);
    return;
   }
   const v=node.value_from==='condition.value'?r.condition?.value:node.value;
   if(!validCount(v)||v>=Number.MAX_SAFE_INTEGER||own(node,'value_from')&&node.value_from!=='condition.value')
    fail('INVALID_THRESHOLD',r.id);
  }else if(own(node,'values')||own(node,'value_from')||own(node,'legacy')||node.op!=='eq'||
    (f.type==='grouped_multi'?!['YES','NO'].includes(node.value):!f.options?.some(o=>o.value===node.value)))
   fail('INVALID_CHOICE',r.id);
 }
 for(const r of rulebook.rules){
  if(!allowedKeys(r,['id','target','effect','condition','offer_clause','offer_scenarios','label','overrides','review','when'])||!nonempty(r.id)||ids.has(r.id))
   fail('DUPLICATE_OR_INVALID_RULE',r?.id);
  ids.add(r.id);scope(r.target,r.id,{requireIssuer:true});effect(r.effect,r.id);condition(r.condition,r);
  if(own(r,'when'))condition(r.when,r);
  if(own(r,'review')){
   if(!allowedKeys(r.review,['condition','label','show_with_primary'])||!nonempty(r.review.label)||own(r.review,'show_with_primary')&&typeof r.review.show_with_primary!=='boolean')
    fail('INVALID_REVIEW',r.id);
   condition(r.review.condition,r);
  }
  if(own(r,'overrides')&&!Array.isArray(r.overrides))fail('INVALID_OVERRIDE',r.id);
  for(const o of r.overrides||[]){
   if(!allowedKeys(o,['target','effect','condition','label','offer_scenarios'])||!o.effect&&!o.condition&&!o.offer_scenarios)fail('INVALID_OVERRIDE',r.id);
   scope(o.target,r.id);
   if(o.effect)effect(o.effect,r.id);
   if(o.condition)condition(o.condition,{...r,condition:o.condition});
   if(own(o,'offer_scenarios'))scenarios(o.offer_scenarios,r);
  }
  if(own(r,'offer_clause')&&!nonempty(r.offer_clause))fail('INVALID_OFFER_CLAUSE',r.id);
  if(own(r,'offer_scenarios'))scenarios(r.offer_scenarios,r);
 }
 const checks=rulebook.coverage_checks||[];
 if(!Array.isArray(checks))fail('INVALID_COVERAGE_CHECKS','rulebook');
 for(const c of checks){
  if(!allowedKeys(c,['id','label','target','covered_targets','dimension'])||!nonempty(c.id)||ids.has(c.id)||!nonempty(c.label)||!['APPLICATION','BONUS'].includes(c.dimension))
   fail('INVALID_COVERAGE_CHECK',c?.id);
  ids.add(c.id);scope(c.target,c.id,{requireIssuer:true});
  if(c.covered_targets)scope(c.covered_targets,c.id,{requireIssuer:true});
 }
 for(const [id,p] of Object.entries(products.overrides)){
  if(!nonempty(id))fail('INVALID_PRODUCT_MAPPING',id);
  scope(p,id,{allowArrays:false});
 }
 if(!Array.isArray(products.unlisted_targets||[]))fail('INVALID_UNLISTED_TARGETS','products');
 for(const p of products.unlisted_targets||[])scope(p,'unlisted_targets',{requireIssuer:true,allowArrays:false});
 return true;
}
function countBands(cuts,unit='张'){
 const starts=uniq([0,...cuts]).filter(validCount).sort((a,b)=>a-b);
 return starts.map((v,i)=>({value:v,label:i===starts.length-1?v+' '+unit+'或更多':
   starts[i+1]===v+1?v+' '+unit:v+'–'+(starts[i+1]-1)+' '+unit}));
}
function createRuntime({rulebook,factbook,products,approval}){
 validate({rulebook,factbook,products,approval});
 const defs=factbook.facts, rules=rulebook.rules;
 const baseIds=[approval.age_fact,approval.score_fact,...approval.activity_facts],baseSet=new Set(baseIds);
 const supported=new Set(rulebook.supported_issuers);
 const canonical=p=>({...p,...products.overrides[p.product_id]});
 const key=(id,f)=>f.answer_key||id;
 function factValue(id,node,a){
  const f=defs[id];
  return f.type==='grouped_multi'?a[f.details_id]?.[node.prior]?.[id]:
    f.group?a[f.group]?.[id]:a[key(id,f)];
 }
 function option(id,f,v,p,legacy=[]){
  const extra=f.options_by_value?.[v]||{};
  const label=extra.labels_by_issuer?.[p.issuer]||extra.label||factbook.labels?.[v]||v;
  return {value:v,label:legacy.includes(v)&&!label.includes('旧版本')&&!label.includes('以前的版本')?label+'（包括以前的版本）':label,
   ...(extra.prior_id?{prior_id:extra.prior_id}:{})};
 }
 function baseRisk(a,issuer){
  const age=approval.age_map[factValue(approval.age_fact,{},a)],score=approval.score_map[factValue(approval.score_fact,{},a)];
  const activityValues=approval.activity_facts.map(id=>factValue(id,{},a));
  if(!age||!score||activityValues.some(x=>!countRange(x)))return {rating:'INSUFFICIENT_DATA',activity:'UNKNOWN'};
  const level=n=>approval.activity_bands.filter(b=>b.min<=n).at(-1).level;
  const low=Math.max(...activityValues.map(x=>level(countRange(x)[0]))),high=Math.max(...activityValues.map(x=>level(countRange(x)[1])));
  if(low!==high)return {rating:'INSUFFICIENT_DATA',activity:'UNKNOWN'};
  const levels=[low];
  const activity=approval.activity_levels[Math.max(...levels)],base=approval.base_matrix[age]?.[score]||'INSUFFICIENT_DATA';
  const i=approval.risk_levels.indexOf(base),adjustment=approval.activity_adjustment[activity]?.[approval.issuer_sensitivity[issuer]]||0;
  return {rating:i<0?base:approval.risk_levels[Math.min(approval.risk_levels.length-1,i+adjustment)],activity};
 }
 function assessCore({product,answers={},offer_variant='STANDARD',offer_facts,offer_rule_overrides={}}={}){
  const p=canonical(product||{});
  if(!supported.has(p.issuer))return null;
  const a=answers&&typeof answers==='object'&&!Array.isArray(answers)?answers:{};
  const groups=new Map(),events=[],active=[],gated=[],unresolved=[],assumed=[],explicit=[];
  const matched=rules.filter(r=>targetState(r.target,p)===true);
  const clauses=new Set(matched.filter(r=>r.offer_clause).map(r=>r.offer_clause));
  for(const [id,state] of Object.entries(offer_rule_overrides)){
   if(!clauses.has(id)||!['PRESENT','ABSENT'].includes(state))throw Error('INVALID_OFFER_RULE_OVERRIDE');
  }
  
  function record(node,r,values,threshold,raw){
   const id=node.fact,f=defs[id],qid=f.type==='grouped_multi'?groupKey(f,id):f.group||key(id,f);
   let entry=groups.get(qid);
   if(!entry){
    entry={id:qid,type:f.group?'structured':f.type==='grouped_multi'?'marriott_multi':f.type,title:f.group?f.group_title:f.title,
      ...(f.description?{description:f.description}:{}),rules:new Set(),fields:new Map(),options:new Map(),cuts:new Set(),pending:false,count_unit:f.count_unit,
      ...(f.type==='grouped_multi'?{fact_field:id,details_id:f.details_id,history_id:f.history_id,clear_when_not_no:f.clear_when_not_no||[]}:{}) ,
      ...(f.type==='multi'&&f.details_id?{details_id:f.details_id}:{})};
    groups.set(qid,entry);
   }
   if(r)entry.rules.add(r.id);
   if(baseSet.has(id))entry.base_credit=true;
   let e=entry;
   if(f.group){
    if(!entry.fields.has(id))entry.fields.set(id,{id,type:f.type,label:f.title,rules:new Set(),cuts:new Set(),options:new Map(),pending:false,count_unit:f.count_unit});
    e=entry.fields.get(id);if(r)e.rules.add(r.id);
   }
   const missing=f.type==='multi'?!knownList(raw):f.type==='number'?countPredicate(raw,node.op,threshold)===null:f.type==='grouped_multi'?!['YES','NO'].includes(raw):empty(raw)||!f.options?.some(o=>o.value===raw);
   if(missing){e.pending=true;entry.pending=true;}
   if(f.type==='number'){
    const t=threshold;
    if(['gte','lt','eq'].includes(node.op))e.cuts.add(t);
    if(['gt','lte','eq'].includes(node.op))e.cuts.add(t+1);
   }else if(f.type==='multi'){
    const legacy=resolved(node.legacy||[],p);
    for(const value of values){
     const o=option(id,f,value,p,legacy);
     const old=e.options.get(value);
     e.options.set(value,{...o,label:old?.label?.includes('以前的版本')||old?.label?.includes('旧版本')?old.label:o.label,rule_ids:uniq([...(old?.rule_ids||[]),r.id])});
    }
   }else if(f.type==='grouped_multi'){
    const history=defs[f.history_id];
    const v=Object.keys(history.options_by_value).find(v=>history.options_by_value[v].prior_id===node.prior);
    const label=option(f.history_id,history,v,p).label,old=e.options.get(node.prior);
    e.options.set(node.prior,{value:node.prior,label,answered:!missing,pending:missing,rule_ids:uniq([...(old?.rule_ids||[]),r.id])});
   }else for(const o of f.options||[])e.options.set(o.value,o);
   return qid;
  }
  // Register base facts first; bank predicates add their cuts and rule IDs
  // to the same question entry, not to a second question list.
  for(const id of baseIds){
   const raw=factValue(id,{},a);
   if(defs[id].type==='number'){
    for(const band of approval.activity_bands)record({fact:id,op:'gte'},null,[],band.min,raw);
   }else record({fact:id,op:'eq'},null,[],undefined,raw);
  }
  function leaf(node,r){
   const f=defs[node.fact],raw=factValue(node.fact,node,a);
   const values=node.op==='includes_any'?resolved(node.values,p):[];
   const threshold=node.value_from==='offer_limit'?offer_facts?.rule_limits?.[r.offer_clause]:node.value_from==='condition.value'?r.condition.value:node.value;
   if(node.op==='includes_any'&&!values.length)return {state:null,hits:[],actions:[]};
   let hits=[],state=null,reason='',qid;
   if(node.op==='includes_any'){
    const alias=f.positive_aliases;
    const aliasValues=alias&&knownList(a[alias.fact])?a[alias.fact].flatMap(v=>alias.map[v]||[]):[];
    const chosen=knownList(raw)?raw:[];
    hits=values.filter(v=>chosen.includes(v)||aliasValues.includes(v));
    state=hits.length?true:knownList(raw)?false:null;
    qid=record(node,r,values,threshold,raw);
    reason=hits.map(v=>(f.evidence_prefix||'已选择 ')+v+(f.evidence_suffix||'')).join('、');
   }else{
    qid=record(node,r,values,threshold,raw);
    const valid=f.type==='number'?countPredicate(raw,node.op,threshold)!==null:f.type==='grouped_multi'?['YES','NO'].includes(raw):f.options?.some(o=>o.value===raw)&&!empty(raw);
    if(valid){
     state=f.type==='number'?countPredicate(raw,node.op,threshold):raw===threshold;
     if(f.type==='number'){
      const comparator={gte:'达到 ',gt:'超过 ',lt:'少于 ',lte:'不超过 ',eq:'等于 '}[node.op];
      reason=f.title+' '+(state?comparator:node.op==='gte'?'少于 ':node.op==='gt'?'不超过 ':node.op==='lt'?'达到 ':node.op==='lte'?'超过 ':'不等于 ')+threshold+' '+(f.count_unit||'张');
     }else reason=f.title.replace(/[？?]$/,'')+'：'+(f.type==='grouped_multi'?(raw==='YES'?'是':'否'):(f.options.find(o=>o.value===raw)?.label||raw));
    }
   }
   const evidence=state===true?(node.op==='includes_any'?hits.map(value=>({question_id:qid,value,reason:(f.evidence_prefix||'已选择 ')+value+(f.evidence_suffix||'')})):
    [{question_id:qid,...(f.type==='grouped_multi'?{value:node.prior}:f.group?{field:node.fact}:{}),reason}]):[];
   return {state,hits:evidence,actions:state===true&&node.action?[node.action]:[],reason,pending:state===null};
  }
  function evaluate(node,r){
   if(node.any){
    const parts=node.any.map(n=>evaluate(n,r)),yes=parts.filter(x=>x.state===true);
    return {state:yes.length?true:parts.some(x=>x.state===null)?null:false,
      hits:yes.flatMap(x=>x.hits),actions:yes.flatMap(x=>x.actions),pending:parts.some(x=>x.pending||x.state===null)};
   }
   if(node.all){
    const hits=[],actions=[];let pending=false;
    // Ordered guard semantics: do not ask a later dependent fact before
    // the earlier facts establish its relevance.
    for(const n of node.all){
     const x=evaluate(n,r);
     if(x.state!==true)return {state:x.state,hits:[],actions:[],pending:x.pending||x.state===null};
     hits.push(...x.hits);actions.push(...x.actions);pending||=!!x.pending;
    }
    return {state:true,hits,actions,pending};
   }
   return leaf(node,r);
  }
  function effectFor(r){
   const o=(r.overrides||[]).find(x=>targetState(x.target,p)===true);
   return {...r,...(o?.effect?{effect:o.effect}:{}),...(o?.condition?{condition:o.condition}:{}),...(o?.offer_scenarios?{offer_scenarios:o.offer_scenarios}:{}),label:o?.label||r.label||r.id};
  }
  const actionOf=(e,dimension,actions)=>e[dimension]===3?
    (e[dimension+'_action']||(actions.includes('BLOCK')?'BLOCK':actions.includes('WAIT')?'WAIT':'BLOCK')):e[dimension]>0?'RISK':'CLEAR';
  function makeEvent(r,status,e,label,x={hits:[],actions:[]},reason){
   const app=e.application,bonus=e.bonus;
   const fired=status==='TRIGGERED';
   return {rule_id:r.id,label,dimension:app&&bonus?'APPLICATION+BONUS':app?'APPLICATION':'BONUS',
    status,application_impact:fired?app:0,bonus_impact:fired?bonus:0,
    configured_application_impact:app,configured_bonus_impact:bonus,
    application_action:fired?actionOf(e,'application',x.actions):'CLEAR',
    bonus_action:fired?actionOf(e,'bonus',x.actions):'CLEAR',
    ...(e.product_gate?{product_eligibility:true}:{}),...(bonus===3?{hard_bonus_eligibility:true}:{}),
    ...(x.hits?.length?{trigger_sources:x.hits}:{}),
    ...(fired&&x.pending?{pending_facts:true}:{}),
    reason:reason|| (fired?(x.hits.map(h=>h.reason).filter(Boolean).join('；')||label):status==='MISSING'?'还需要补充相关信息':status==='REVIEW'?'相关条款或事实需要核实':'未触发限制')};
  }
  const needsOfferLimit=node=>node?.value_from==='offer_limit'||(node?.any||node?.all||[]).some(needsOfferLimit);
  for(const sourceRule of rules){
   const scope=targetState(sourceRule.target,p);
   if(scope===false)continue;
   const r=effectFor(sourceRule),{effect:e,label}=r;
   if(scope===null){unresolved.push({rule_id:r.id,stage:'TARGET'});events.push(makeEvent(r,'REVIEW',e,label,undefined,'卡片资料需要核实'));continue;}
   if(r.offer_clause){
    const explicitState=offer_rule_overrides[r.offer_clause];
    const state=explicitState??(offer_facts===undefined?r.offer_scenarios?.[offer_variant]:offer_facts?.rule_clause_state?.[r.offer_clause]);
    if(explicitState!==undefined)explicit.push(r.offer_clause);
    else if(offer_facts===undefined&&state)assumed.push(r.offer_clause);
    if(state==='ABSENT')continue;
    if(state!=='PRESENT'){gated.push({rule_id:r.id,stage:'SYSTEM_GATE'});events.push(makeEvent(r,'REVIEW',e,label,undefined,'本次 Offer 条款需要核实'));continue;}
    if([r.condition,r.when,r.review?.condition].some(needsOfferLimit)&&(!validCount(offer_facts?.rule_limits?.[r.offer_clause])||offer_facts.rule_limits[r.offer_clause]<1||offer_facts.rule_limits[r.offer_clause]>=Number.MAX_SAFE_INTEGER)){
     gated.push({rule_id:r.id,stage:'OFFER_LIMIT'});events.push(makeEvent(r,'REVIEW',e,label,undefined,'具体申请条款的账户数门槛尚未核实'));continue;
    }
   }
   active.push(r.id);
   const gate=r.when?evaluate(r.when,r):{state:true,hits:[],actions:[]};
   if(gate.state!==true){events.push(makeEvent(r,gate.state===false?'CLEAR':'MISSING',e,label));continue;}
   const x=evaluate(r.condition,r);
   const review=r.review&&(x.state===false||r.review.show_with_primary)?evaluate(r.review.condition,r):null;
   if(x.state===true){
    events.push(makeEvent(r,'TRIGGERED',e,label,{hits:[...gate.hits,...x.hits],actions:x.actions,pending:!!(gate.pending||x.pending||review?.pending)},r.overrides?.some(o=>o.label&&targetState(o.target,p)===true)?label:undefined));
   }else if(x.state===null)events.push(makeEvent(r,'MISSING',e,label));
   else if(review?.state===true)events.push(makeEvent(r,'REVIEW',e,label,undefined,r.review.label));
   else if(review?.state===null)events.push(makeEvent(r,'MISSING',e,label));
   else events.push(makeEvent(r,'CLEAR',e,label));
  }
  // Coverage gaps are source-backed missing system knowledge, not negative
  // rules or questions. Only explicit reviewed coverage can resolve them.
  for(const c of rulebook.coverage_checks||[]){
   const matched=targetState(c.target,p);
   if(matched===false||c.covered_targets&&targetState(c.covered_targets,p)===true)continue;
   if(matched===true&&offer_facts?.coverage_state?.[c.id]==='CONFIRMED_NO_ADDITIONAL_RULES')continue;
   gated.push({rule_id:c.id,stage:'COVERAGE'});
   events.push({rule_id:c.id,label:c.label,dimension:c.dimension,coverage_dimension:c.dimension,status:'REVIEW',application_impact:0,bonus_impact:0,
    configured_application_impact:0,configured_bonus_impact:0,application_action:'CLEAR',bonus_action:'CLEAR',reason:c.label});
  }
  function form(e){
   const out={id:e.id,type:e.type,title:e.title,section:e.base_credit?'common':'specific',base_credit:!!e.base_credit,rule_ids:[...e.rules],...(e.description?{description:e.description}:{})};
   if(e.type==='structured')out.fields=[...e.fields.values()].map(f=>({id:f.id,type:f.type,label:f.label,rule_ids:[...f.rules],
    ...(f.type==='number'?{count_bands:countBands([...f.cuts],f.count_unit)}:{options:[...f.options.values()]})}));
   else if(e.type==='number')out.count_bands=countBands([...e.cuts],e.count_unit);
   else {
    out.options=[...e.options.values()];
    if(e.type==='multi'||e.type==='marriott_multi')out.allow_none=true;
    if(e.details_id)out.details_id=e.details_id;
    if(e.type==='marriott_multi')Object.assign(out,{fact_field:e.fact_field,history_id:e.history_id,clear_when_not_no:e.clear_when_not_no});
   }
   return out;
  }
  const questions=[...groups.values()].map(form),pending=[...groups.values()].filter(e=>e.pending).map(form);
  const app=events.filter(x=>x.configured_application_impact>0||x.coverage_dimension==='APPLICATION');
  const bonus=events.filter(x=>x.configured_bonus_impact>0||x.product_eligibility||x.coverage_dimension==='BONUS');
  const triggered=xs=>xs.filter(x=>x.status==='TRIGGERED');
  const gaps=xs=>xs.filter(x=>['MISSING','REVIEW'].includes(x.status)||x.pending_facts);
  const productBlockers=triggered(app).filter(x=>x.product_eligibility);
  const blockIds=productBlockers.map(x=>x.rule_id);
  const max=(xs,k)=>Math.max(0,...xs.map(x=>x[k]));
  const applicationImpact=max(app,'application_impact'),bonusImpact=productBlockers.length?3:max(bonus,'bonus_impact');
  const combine=(xs,dim)=>xs.some(x=>x[dim+'_action']==='BLOCK')?'BLOCK':xs.some(x=>x[dim+'_action']==='WAIT')?'WAIT':
   xs.some(x=>x[dim+'_action']==='RISK')?'RISK':gaps(xs).length?'UNKNOWN':'CLEAR';
  const appAction=combine(app,'application');
  // A product gate eliminates the new-card reward path, but cannot erase an
  // independent bonus BLOCK. Aggregate actions after projection, not before.
  const projectedBonus=bonus.map(x=>x.product_eligibility&&x.status==='TRIGGERED'?
   {...x,bonus_action:x.bonus_action==='BLOCK'||x.application_action==='BLOCK'?'BLOCK':'WAIT'}:x);
  const bonusAction=combine(projectedBonus,'bonus');
  const base=baseRisk(a,p.issuer);
  const appStatus=productBlockers.length?'PRODUCT_INELIGIBLE':appAction==='BLOCK'?'APPLICATION_INELIGIBLE':appAction==='WAIT'?'WAIT':
   appAction==='RISK'?'ELEVATED_RISK':appAction==='UNKNOWN'||base.rating==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'MODEL_ONLY';
  const bonusStatus=productBlockers.length?'PRODUCT_INELIGIBLE':bonusAction==='BLOCK'||bonusAction==='WAIT'?'BONUS_INELIGIBLE':bonusAction==='RISK'?'LIKELY_RESTRICTED':
   bonusAction==='UNKNOWN'?'NEEDS_REVIEW':'NO_TRIGGER_FOUND';
  const appReasons=triggered(app).filter(x=>x.application_impact===applicationImpact).map(x=>x.label);
  const bonusReasons=triggered(bonus).filter(x=>x.bonus_impact===bonusImpact||x.product_eligibility).map(x=>x.label);
  const messageApp=appStatus==='PRODUCT_INELIGIBLE'?'按参考条款，你不符合这张卡的申请条件'+(appAction==='WAIT'?'，需等待限制解除':'')+'：'+appReasons.join('、'):
   appStatus==='APPLICATION_INELIGIBLE'?'不符合申请条件：'+appReasons.join('、'):
   appStatus==='WAIT'?'建议等待申请限制解除：'+appReasons.join('、'):
   appStatus==='ELEVATED_RISK'?'发现可能影响申请的情况：'+appReasons.join('、'):
   appStatus==='INSUFFICIENT_DATA'?'还有信用情况或申请信息需要确认':'目前未发现申请限制；实际获批以银行为准';
  const messageBonus=bonusStatus==='PRODUCT_INELIGIBLE'?'按参考条款，你不符合这次开卡奖励条件'+(bonusAction==='WAIT'?'，需等待限制解除':'')+'：'+bonusReasons.join('、'):
   bonusStatus==='BONUS_INELIGIBLE'?'按参考条款，你不符合这次开卡奖励条件'+(bonusAction==='WAIT'?'，需等待限制解除':'')+'：'+bonusReasons.join('、'):
   bonusStatus==='LIKELY_RESTRICTED'?'按参考条款，你这次可能拿不到开卡奖励：'+bonusReasons.join('、'):
   bonusStatus==='NEEDS_REVIEW'?'还有持卡历史或奖励条款需要确认':'目前未发现开卡奖励限制，最终以银行为准';
  function result(xs,dim,status,impact,action,message){
   return {status,impact,action,message,complete:gaps(xs).length===0,triggered_rules:triggered(xs).map(x=>x.rule_id),
    missing_rules:xs.filter(x=>x.status==='MISSING'||x.pending_facts).map(x=>x.rule_id),
    unresolved_rules:gaps(xs).map(x=>({rule_id:x.rule_id,status:x.pending_facts?'MISSING':x.status,reason:x.pending_facts?'已发现限制，但还有相关条件需要确认':x.reason}))};
  }
  const application={...result(app,'application',appStatus,applicationImpact,appAction,messageApp),base_risk:base.rating,activity:base.activity,
   base_completed:base.rating!=='INSUFFICIENT_DATA',issuer_rules_completed:!gaps(app).length,complete:base.rating!=='INSUFFICIENT_DATA'&&!gaps(app).length,product_blocking_rules:blockIds};
  const bonusResult={...result(bonus,'bonus',bonusStatus,bonusImpact,bonusAction,messageBonus),product_blocking_rules:blockIds};
  // Overall advice consumes the two aggregated dimensions, never evaluates bank facts again.
  const actions=[application.action,bonusResult.action];
  const decision=actions.includes('BLOCK')?{code:'BLOCK',label:'暂不建议申请',summary:'存在不符合申请或开卡奖励条件的情况。'}:
   actions.includes('WAIT')?{code:'WAIT',label:'建议等待',summary:'存在需要等待解除的申请或开卡奖励限制。'}:
   !application.complete||!bonusResult.complete?{code:'REVIEW',label:'还需要确认',summary:'部分信用情况、持卡历史或优惠条款尚未确认。'}:
   actions.includes('RISK')||application.base_risk==='HIGH_RISK'?{code:'RISK',label:'谨慎考虑申请',summary:'有可能影响获批或开卡奖励的情况。'}:
   {code:'CLEAR',label:'可以考虑申请',summary:'按已填信息及参考条款，暂未发现明显限制；实际结果以银行为准。'};
  const matrixEvents=events.filter(x=>rules.find(r=>r.id===x.rule_id)?.when?.fact&&defs[rules.find(r=>r.id===x.rule_id).when.fact]?.details_id);
  return {questionnaire:{common:pending.filter(q=>q.section==='common'),specific:pending.filter(q=>q.section==='specific'),editable:questions,benefits:null},
   diagnostics:{applicable_rule_ids:active,unresolved_system_gates:gated,unresolved_target_mappings:unresolved,answer_conflicts:[]},
   evaluation:{issuer:p.issuer,product_id:p.product_id,offer_variant,assumption:offer_facts===undefined?'UNVERIFIED_STANDARD_OFFER_MODEL':'FROZEN_OFFER_FACTS',
    application,bonus:bonusResult,decision,
    rule_results:events,answers_transmitted:false,caveat:'确定性规则模型，不代表银行实际审批结果；答案仅在本机计算。'},
   marriott_matrix:matrixEvents.length?{status:triggered(matrixEvents).length?'TRIGGERED':gaps(matrixEvents).length?'MISSING':'CLEAR'}:null,
   offer_context:clauses.size?{variant:offer_variant,assumed_standard_rules:assumed,explicitly_overridden_rules:explicit,assumption:offer_facts===undefined?'UNVERIFIED_STANDARD_OFFER_MODEL':'FROZEN_OFFER_FACTS'}:null};
 }
 // Number choices are explicit ranges; numeric API inputs are exact. Reject only
 // contradictions that are impossible for every count in the selected bands.
 // Re-evaluate without the conflicting facts: unrelated verified blockers survive.
 function assess(request={}){
  const first=assessCore(request);
  if(!first)return null;
  const a=request.answers||{},qmap=new Map();
  for(const q of first.questionnaire.editable){
   if(q.type==='number')qmap.set(q.id,q.count_bands);
   else if(q.type==='structured')for(const field of q.fields)if(field.type==='number')qmap.set(field.id,field.count_bands);
  }
  function interval(id){
   const f=defs[id];
   return qmap.has(key(id,f))?countRange(factValue(id,{},a)):null;
  }
  const conflicts=[],invalid=new Set();
  for(const r of factbook.count_relations||[]){
   const short=interval(r.shorter),long=interval(r.longer);
   if(short&&long&&short[0]>long[1]){
    conflicts.push({fact_ids:[r.shorter,r.longer],message:r.message});
    invalid.add(r.shorter);invalid.add(r.longer);
   }
  }
  if(!invalid.size)return first;
  const clean={...a};
  for(const id of invalid){
   const f=defs[id];
   if(f.group){clean[f.group]={...clean[f.group]};delete clean[f.group][id];}
   else delete clean[key(id,f)];
  }
  const result=assessCore({...request,answers:clean});
  result.diagnostics.answer_conflicts=conflicts;
  return result;
 }
 function createFacade(lookup){
  if(!lookup?.findById||!lookup?.resolve||!lookup?.list)throw Error('IDENTITY_LOOKUP_REQUIRED');
  const catalog=lookup.list().map(x=>canonical(lookup.findById(x.product_id)));
  const knownIds=new Set(catalog.map(p=>p.product_id));
  for(const id of Object.keys(products.overrides))if(!knownIds.has(id))throw Error('UNKNOWN_PRODUCT_MAPPING '+id);
  const targets=[...catalog,...(products.unlisted_targets||[])];
  for(const c of rulebook.coverage_checks||[])if(!targets.some(p=>targetState(c.target,p)===true))throw Error('COVERAGE_TARGET_NOT_FOUND '+c.id);
  for(const r of rules){
   if(!targets.some(p=>targetState(r.target,p)===true))throw Error('RULE_TARGET_NOT_FOUND '+r.id);
   if(Array.isArray(r.target.product_name))for(const name of r.target.product_name)
    if(!targets.some(p=>targetState({...r.target,product_name:name},p)===true))throw Error('RULE_PRODUCT_NOT_FOUND '+r.id+' '+name);
   for(const o of r.overrides||[])if(!targets.some(p=>targetState(r.target,p)===true&&targetState(o.target,p)===true))
    throw Error('OVERRIDE_TARGET_NOT_FOUND '+r.id);
  }
  function plan({product_id,input,issuer,customer_type,confirm_product_id,known_facts={},offer_variant='STANDARD',offer_facts,offer_rule_overrides={}}={}){
   const identity=product_id?{status:lookup.findById(product_id)?'MATCHED':'UNKNOWN_PRODUCT',product:{product_id}}:lookup.resolve({input,issuer});
   if(confirm_product_id&&identity.product?.product_id!==confirm_product_id&&
      ![...(identity.candidates||[]),...(identity.suggestions||[])].some(x=>x.product_id===confirm_product_id))
    return {status:'INVALID_CONFIRMATION',identity,questionnaire:null};
   const resolvedId=identity.status==='MATCHED'?identity.product.product_id:
    confirm_product_id&&[...(identity.candidates||[]),...(identity.suggestions||[])].some(x=>x.product_id===confirm_product_id)?confirm_product_id:null;
   if(!resolvedId)return {status:identity.status,identity,questionnaire:null};
   const p=lookup.findById(resolvedId);
   if(!p||issuer&&issuer!==p.issuer||customer_type&&customer_type!==p.customer_type)return {status:'IDENTITY_CONFLICT',questionnaire:null};
   const model=assess({product:p,answers:known_facts,offer_variant,offer_facts,offer_rule_overrides});
   if(!model)return {status:'NOT_SUPPORTED',questionnaire:null};
   return {status:product_id?'MATCHED_ID':identity.status==='MATCHED'?'MATCHED':'CONFIRMED_CANDIDATE',
    identity:{product_id:p.product_id,name:p.name,issuer:p.issuer,customer_type:p.customer_type,source:p.identity_source,
     formal_nb_card_id:p.formal_nb_card_id||null},
    questionnaire:{product_id:p.product_id,questionnaire:model.questionnaire,diagnostics:model.diagnostics},
    evaluation:model.evaluation,marriott_matrix:model.marriott_matrix,offer_context:model.offer_context,
    limitations:{user_answers_uploaded:false,offer_terms_verified:offer_facts!==undefined&&model.diagnostics.unresolved_system_gates.length===0,application_availability_verified:false}};
  }
  return Object.freeze({plan,listCards:()=>lookup.list().filter(p=>supported.has(p.issuer)),
   getVersion:()=>({source_count:lookup.getVersion().count,rules_indexed:rules.length,release_id:rulebook.version})});
 }
 return Object.freeze({assess,createFacade,ruleLabels:Object.fromEntries([...rules,...(rulebook.coverage_checks||[])].map(r=>[r.id,r.label||r.id])),version:rulebook.version});
}
return Object.freeze({createRuntime,validate,countBands,targetState});
});
