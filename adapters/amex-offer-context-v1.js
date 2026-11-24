/* AMEX offer-context builder for questionnaire planning.
 * STANDARD means a baseline ordinary public-offer assumption, NOT a verified live offer.
 * NLL means the same-product lifetime clause is absent; other family restrictions remain
 * in force unless independently overridden by the caller.
 * No user answers, persistence, network access, or eligibility decisions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusAmexOfferContextV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VARIANTS=new Set(['STANDARD','NLL']);
  const STATES=new Set(['PRESENT','ABSENT']);
  const SIMPLE_GATE=/^frozen_offer\.rule_clause_state\["([A-Z0-9-]+)"\] = PRESENT$/;

  function makeContext({product,ruleIndex,offer_variant='STANDARD',offer_rule_overrides={},
    targetState}={}){
    if(!product||product.issuer!=='AMEX')throw Error('AMEX_PRODUCT_REQUIRED');
    if(!Array.isArray(ruleIndex?.rules)||typeof targetState!=='function')
      throw Error('AMEX_RULE_INDEX_REQUIRED');
    if(!VARIANTS.has(offer_variant))throw Error('INVALID_OFFER_VARIANT');
    if(!offer_rule_overrides||typeof offer_rule_overrides!=='object'||
      Array.isArray(offer_rule_overrides))throw Error('INVALID_OFFER_RULE_OVERRIDES');
    const clauses=Object.create(null),defaults=[],explicit=[],unknown=[],scoped=new Set();
    for(const rule of ruleIndex.rules){
      if(!rule.id.startsWith('AMEX')||rule.runtime_class!=='EXECUTABLE_RULE'||
        rule.status!=='ACTIVE')continue;
      const gate=SIMPLE_GATE.exec(rule.system_gate||'');
      if(!gate)continue;
      const state=targetState(rule.target_predicate,product);
      if(state===true){
        scoped.add(rule.id);
        // Standard Amex is the QUESTIONNAIRE model baseline; it does not certify
        // that a particular current offer actually contains this clause.
        clauses[gate[1]]='PRESENT';
        defaults.push(rule.id);
      }else if(state===null)unknown.push(rule.id);
    }
    // NLL removes the plain same-product lifetime clause only. Some marketing
    // offers omit family language too, but that is NOT inferred from NLL.
    if(offer_variant==='NLL'&&scoped.has('AMEX-001')){
      clauses['AMEX-001']='ABSENT';
    }
    for(const [id,value] of Object.entries(offer_rule_overrides)){
      if(!scoped.has(id)||!STATES.has(value))throw Error('INVALID_OFFER_RULE_OVERRIDE');
      clauses[id]=value;
      explicit.push(id);
    }
    return {
      offer_facts:{rule_clause_state:clauses},
      context:{
        variant:offer_variant,assumption:'UNVERIFIED_STANDARD_OFFER_MODEL',
        explicitly_overridden_rules:explicit,
        assumed_standard_rules:defaults.filter(id=>!explicit.includes(id)),
        unresolved_target_rules:unknown,
        note:offer_variant==='NLL'
          ?'NLL removes same-product lifetime language only. Family clauses remain unless explicitly overridden.'
          :'Standard published-offer clauses are modeled as present for questionnaire routing, not verified live terms.'
      }
    };
  }
  return Object.freeze({version:'1',makeContext});
});