/* A thin, offline-only Assessment facade: card identity -> questionnaire schema.
   This is NOT a remote HTTP evaluation endpoint and does not upload answers. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusQuestionnaireFacadeV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ISSUERS=new Set(['AMEX','CHASE','CITI','CAPITAL_ONE','BOFA',
    'US_BANK','BARCLAYS','WELLS_FARGO','COLUMN_NA','DISCOVER']);
  const TYPES=new Set(['PERSONAL','BUSINESS']);
  const FORMS=new Set(['REVOLVING_CREDIT','CHARGE_OR_PAY_OVER_TIME']);
  function createFacade({planner,lookup,amexEnricher}){
    if(!planner?.getQuestionnaireForProduct||!lookup?.resolve||!lookup?.findById)
      throw Error('QUESTIONNAIRE_DEPENDENCY_MISSING');
    function plan({input,issuer,customer_type,known_facts={},confirm_product_id}={}){
      const lookupResult=lookup.resolve({input,issuer});
      const candidate=confirm_product_id&&lookup.findById(confirm_product_id);
      if(issuer&&!ISSUERS.has(issuer))
        return {status:'INVALID_ISSUER',identity:lookupResult,questionnaire:null};
      if(customer_type&&!TYPES.has(customer_type))
        return {status:'INVALID_CUSTOMER_TYPE',identity:lookupResult,questionnaire:null};
      if(confirm_product_id&&(!candidate||
        (lookupResult.product?.product_id!==candidate.product_id&&
         ![...(lookupResult.candidates||[]),...(lookupResult.suggestions||[])]
           .some(p=>p.product_id===candidate.product_id))))
        return {status:'INVALID_CONFIRMATION',identity:lookupResult,questionnaire:null};
      let product=null;
      let status=lookupResult.status;
      let identitySource=null;
      if(lookupResult.status==='MATCHED'){
        product=lookup.findById(lookupResult.product.product_id);
        identitySource=product.identity_source;
        status='MATCHED';
      }else if(candidate){
        product=candidate;
        identitySource=product.identity_source;
        status='CONFIRMED_CANDIDATE';
      }else if(lookupResult.status==='NOT_FOUND'&&issuer&&TYPES.has(customer_type)){
        // A user-confirmed issuer permits only issuer-level exploratory routing.
        // Unknown product_name / brand / family and frozen terms remain unknown.
        product={product_id:'unlisted_preview',product_type:'CREDIT_CARD',
          issuer,customer_type,card_form:null,product_name:null,
          brand:null,generation:null,identity_source:'USER_SUPPLIED_PARTIAL'};
        identitySource='USER_SUPPLIED_PARTIAL';
        status='PARTIAL_METADATA_PREVIEW';
      }
      if(!product)
        return {status,identity:lookupResult,questionnaire:null,
          note:'Confirm a listed product, or provide issuer and personal/business type to preview generic questions.'};
      if(issuer&&product.issuer&&issuer!==product.issuer)
        return {status:'ISSUER_CONFLICT',identity:lookupResult,questionnaire:null};
      if(customer_type&&product.customer_type&&customer_type!==product.customer_type)
        return {status:'CUSTOMER_TYPE_CONFLICT',identity:lookupResult,questionnaire:null};
      const metadata={...product,product_type:'CREDIT_CARD',
        customer_type:product.customer_type||customer_type||null,
        card_form:FORMS.has(product.card_form)?product.card_form:null};
      // Exact offer facts only exist in the independently reviewed seven-card
      // runtime. History rows do NOT prove today's offer eligibility terms.
      const initialPlan=identitySource==='REVIEWED_PRODUCT'
        ?planner.getQuestionnaire({product_id:metadata.product_id,known_facts})
        :planner.getQuestionnaireForProduct({product:metadata,known_facts,offer_facts:{}});
      const plan=amexEnricher&&metadata.issuer==='AMEX'
        ?amexEnricher.enrich({plan:initialPlan,product:metadata})
        :initialPlan;
      return {
        status,identity:{product_id:metadata.product_id,
          name:product.name||String(input||'').trim(),issuer:metadata.issuer,
          customer_type:metadata.customer_type,source:identitySource,
          metadata_completeness:identitySource==='REVIEWED_PRODUCT'?'REVIEWED':
          metadata.formal_nb_card_id?'FORMAL_IDENTITY_ONLY':'PARTIAL',
          formal_nb_card_id:metadata.formal_nb_card_id||null},
        questionnaire:plan,limitations:{
          full_eligibility_result_available:false,
          offer_terms_verified:identitySource==='REVIEWED_PRODUCT',
          product_specific_rules_verified:identitySource==='REVIEWED_PRODUCT',
          long_term_benefits_included:false,
          user_answers_uploaded:false,
          application_availability_verified:false
        }
      };
    }
    return Object.freeze({getVersion:()=>({
      contract_version:'1',mode:'offline_card_name_to_questionnaire',
      source_count:lookup.getVersion().count,
      rules_indexed:planner.getVersion().rule_count}),
      search:lookup.resolve,plan});
  }
  return Object.freeze({createFacade});
});