/* NextBonus Assessment standalone questionnaire planner.
   Read-only schema planning; never submits answers, scores users, or mutates Discover.
   UMD lets the same deterministic module run locally in browsers and Node tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusQuestionnairePlannerV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CONTRACT_VERSION='1';
  const TARGET_FIELDS=new Set(['issuer','brand','generation','customer_type',
    'product_type','card_form','product_name','product_lineage']);
  const SKIP_CLASSES=new Set(['REFERENCE_ONLY','INACTIVE']);
  const COMPLETED=new Set(['ACTIVE','ACTIVE WHEN APPLICABLE']);
  const ALLOWED_GATES=/^frozen_offer\.rule_clause_state\["([A-Z0-9-]+)"\] = PRESENT$/;
  const OWN_GATES=/^(COF_CAP1_30D_CLAUSE_STATE|COF_CAP1_OPEN_ACCOUNT_CAP_STATE) = PRESENT$/;

  function targetState(predicate,product){
    if(!product)return null;
    if(!predicate||predicate.startsWith('FALSE'))return false;
    const segments=predicate.split(/\s+AND\s+/);
    let unknown=false;
    for(const text of segments){
      const term=text.trim();
      const eq=/^target\.([a-z_]+) = ([A-Z][A-Z0-9_]*)$/.exec(term);
      const names=/^target\.product_name IN \{([^{}]+)\}$/.exec(term);
      if(eq){
        if(!TARGET_FIELDS.has(eq[1])){unknown=true;continue;}
        if(product[eq[1]]==null){unknown=true;continue;}
        if(String(product[eq[1]])!==eq[2])return false;
      }else if(names){
        // Source product names must match an explicitly reviewed canonical name,
        // never normalized or fuzzily inferred from a publisher's card name.
        if(!product.product_name){unknown=true;continue;}
        if(!names[1].split(';').map(x=>x.trim()).includes(product.product_name))return false;
      }else unknown=true;
    }
    return unknown?null:true;
  }

  function gateState(raw,frozen){
    if(!raw||raw==='NONE')return true;
    const exact=ALLOWED_GATES.exec(raw);
    if(exact){
      const value=frozen?.rule_clause_state?.[exact[1]];
      return value==='PRESENT'?true:value==='ABSENT'?false:null;
    }
    const own=OWN_GATES.exec(raw);
    if(own){
      const value=frozen?.[own[1]];
      return value==='PRESENT'?true:value==='ABSENT'?false:null;
    }
    // "is known", special matrices and compound gates must first be compiled
    // and reviewed as typed predicates. Unknown never prompts the user.
    return null;
  }

  function validGroup(group){return /^F(?:0[1-9]|1[0-2])_[A-Z0-9_]+$/.test(group);}
  function isAnswered(facts,key){
    return Object.prototype.hasOwnProperty.call(facts,key)&&
      facts[key]!==null&&facts[key]!==undefined&&facts[key]!=='';
  }

  function answeredFor(key,facts,ruleIds){
    if(!isAnswered(facts,key))return false;
    if(key!=='F02_ISSUER_APPLICATION_HISTORY')return true;
    const value=facts[key];
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const requirements={
      'AMEX-006':'approved_revolving_90d',
      'AMEX-011':'same_product_applied_or_approved_90d'
    };
    return ruleIds.every(id=>!requirements[id]||isAnswered(value,requirements[id]));
  }
  function needsFollowUp(key,facts){
    if(key!=='F06_AU_BREAKDOWN')return true;
    const recent=facts.F01_RECENT_NEW_ACCOUNTS;
    // For prototyping, F06 is only considered after the user reports a
    // numeric count near/above the Chase 5/24 threshold. Never infer AU count.
    const count=typeof recent==='number'?recent:
      (recent&&typeof recent==='object'?recent.count:null);
    return Number.isInteger(count)&&count>=4;
  }

  function makePlanner({ruleIndex,products,baseQuestions=[],frozenOfferFacts={}}){
    if(ruleIndex?.counts?.rules!==129||!Array.isArray(ruleIndex.rules)||
       ruleIndex.rules.length!==129)throw Error('129-rule reviewed source index required');
    if(!Array.isArray(ruleIndex.facts)||ruleIndex.facts.length!==12)
      throw Error('Reviewed F01-F12 registry required');
    const catalog=products?.cards||{};
    const groups=new Map(ruleIndex.facts.map(f=>[f.id,f]));
    function getVersion(){
      return Object.freeze({contract_version:CONTRACT_VERSION,
        release_id:ruleIndex.release_id,product_count:Object.keys(catalog).length,
        rule_count:ruleIndex.rules.length,
        mode:'questionnaire_plan_only',answer_transport:'none',benefits_included:false});
    }
    function listProducts(){
      return Object.keys(catalog).map(id=>({product_id:id,name:catalog[id].name||catalog[id].product_name,
        issuer:catalog[id].approval_issuer||catalog[id].issuer}));
    }
    function getQuestionnaireForProduct({product,known_facts={},offer_facts}={}){
      if(!product||!product.product_id||product.product_type!=='CREDIT_CARD')
        throw Error('INVALID_PRODUCT_METADATA');
      const product_id=product.product_id;
      // Caller-owned facts remain in memory: the planner returns a schema only,
      // never echoes personal values into its result.
      const facts=known_facts&&typeof known_facts==='object'&&!Array.isArray(known_facts)?known_facts:{};
      const frozen=offer_facts===undefined?(frozenOfferFacts.products?.[product_id]||{}):offer_facts;
      const byGroup=new Map(),routed=[],gated=[],unresolved=[],reference=[];
      for(const rule of ruleIndex.rules){
        if(SKIP_CLASSES.has(rule.runtime_class)||rule.runtime_class==='EXECUTABLE_META'){
          reference.push(rule.id);continue;
        }
        if(rule.runtime_class!=='EXECUTABLE_RULE'||rule.status!=='ACTIVE')continue;
        const applies=targetState(rule.target_predicate,product);
        if(applies===false)continue;
        if(applies===null){unresolved.push({rule_id:rule.id,stage:'TARGET'});continue;}
        const gate=gateState(rule.system_gate,frozen);
        if(gate===false)continue;
        if(gate===null){gated.push({rule_id:rule.id,stage:'SYSTEM_GATE'});continue;}
        routed.push(rule.id);
        // Rules need facts only after exact target and system gates pass.
        if(rule.question_eligible==='NO'||rule.ask_policy==='NEVER_ASK_SYSTEM'||
           rule.ask_policy==='REUSE_EXISTING_FACT_NO_NEW_ASK')continue;
        for(const group of rule.fact_groups){
          if(!validGroup(group))continue;
          const definition=groups.get(group);
          if(!definition||!COMPLETED.has(definition.policy))continue;
          if(!byGroup.has(group))byGroup.set(group,[]);
          byGroup.get(group).push(rule.id);
        }
      }
      const specific=[];
      for(const [key,dependencies] of byGroup){
        if(answeredFor(key,facts,dependencies)||!needsFollowUp(key,facts))continue;
        const definition=groups.get(key);
        specific.push({id:key,type:'fact_group',title:definition.prompt,
          source:'reviewed_fact_registry',rule_ids:[...new Set(dependencies)],
          reuse_scope:'local_session_or_user_profile'});
      }
      return Object.freeze({contract_version:CONTRACT_VERSION,
        release_id:ruleIndex.release_id,product_id,locale:'zh-CN',
        questionnaire:{common:baseQuestions.filter(q=>!isAnswered(facts,q.id))
          .map(q=>({id:q.id,title:q.title,type:q.type,options:q.options||[]})),
          specific,benefits:null},
        diagnostics:{applicable_rule_ids:routed,unresolved_system_gates:gated,
          unresolved_target_mappings:unresolved,
          excluded_non_executable_count:reference.length},
        evaluation_ready:false,
        note:'Questionnaire preview only. No eligibility or approval decision is calculated.'});
    }
    function getQuestionnaire({product_id,known_facts={},offer_facts}={}){
      const product=catalog[product_id];
      if(!product)throw Error('UNKNOWN_PRODUCT');
      return getQuestionnaireForProduct({product,known_facts,
        offer_facts:offer_facts===undefined?(frozenOfferFacts.products?.[product_id]||{}):offer_facts});
    }
    return Object.freeze({getVersion,listProducts,getQuestionnaire,getQuestionnaireForProduct});
  }
  return Object.freeze({contractVersion:CONTRACT_VERSION,targetState,gateState,
    makePlanner});
});