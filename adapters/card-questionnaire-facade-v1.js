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
  function createFacade({planner,lookup,amexEnricher,amexOfferContext,ruleIndex,targetState,amexDecision,amexPolicy,approvalConfig,marriottMatrix,chaseEnricher,chasePolicy,chaseDecision}){
    if(!planner?.getQuestionnaireForProduct||!lookup?.resolve||!lookup?.findById)
      throw Error('QUESTIONNAIRE_DEPENDENCY_MISSING');
    function plan({input,product_id,issuer,customer_type,known_facts={},confirm_product_id,
      offer_variant='STANDARD',offer_rule_overrides={}}={}){
      // Product selectors pass an exact catalog ID instead of round-tripping
      // a label through fuzzy name/URL matching.
      const selected=product_id?lookup.findById(product_id):null;
      const lookupResult=product_id
        ?{status:selected?'MATCHED':'UNKNOWN_PRODUCT',candidates:[],
          product:selected?{product_id:selected.product_id}:null}
        :lookup.resolve({input,issuer});
      const candidate=confirm_product_id&&lookup.findById(confirm_product_id);
      if(product_id&&!selected)
        return {status:'UNKNOWN_PRODUCT',identity:lookupResult,questionnaire:null};
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
        product=selected||lookup.findById(lookupResult.product.product_id);
        identitySource=product.identity_source;
        status=selected?'MATCHED_ID':'MATCHED';
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
      // Chase identity-only catalog labels differ from the reviewed Bank Rules
      // canonical target strings. Map ONLY explicitly reviewed product IDs;
      // never fuzzy-match a card name into a bonus family or a variant.
      if(metadata.issuer==='CHASE'&&chasePolicy?.canonical_target_names?.[metadata.product_id]){
        metadata.product_name=chasePolicy.canonical_target_names[metadata.product_id];
        // Known cataloged Chase products are not personal United Club cards.
        // Do not leave the lineage UNKNOWN for every other Chase product.
        metadata.product_lineage='NOT_UNITED_CLUB';
      }
      // AMEX has an explicit simulated ordinary-offer baseline. NLL and
      // individual rule exceptions are typed inputs and never inferred from
      // current web offers. Other issuers retain the reviewed/unknown gates.
      const amexContext=amexOfferContext&&metadata.issuer==='AMEX'
        ?amexOfferContext.makeContext({product:metadata,ruleIndex,targetState,
          offer_variant,offer_rule_overrides})
        :null;
      const initialPlan=amexContext
        ?planner.getQuestionnaireForProduct({product:metadata,known_facts,
          offer_facts:amexContext.offer_facts})
        :identitySource==='REVIEWED_PRODUCT'
          ?planner.getQuestionnaire({product_id:metadata.product_id,known_facts})
          :planner.getQuestionnaireForProduct({product:metadata,known_facts,offer_facts:{}});
      const enriched=amexEnricher&&metadata.issuer==='AMEX'
        ?amexEnricher.enrich({plan:initialPlan,product:metadata,known_facts})
        :chaseEnricher&&metadata.issuer==='CHASE'
          ?chaseEnricher.enrich({plan:initialPlan,product:metadata,known_facts})
          :initialPlan;
      const marriottResult=marriottMatrix&&metadata.issuer==='AMEX'
        ?marriottMatrix.evaluate({product:metadata,known_facts}):null;
      const plan=marriottResult?.applicable
        ?{...enriched,questionnaire:{...enriched.questionnaire,
          specific:[...enriched.questionnaire.specific.filter(q=>q.id!=='F07_MARRIOTT_HISTORY'),
            ...marriottResult.questions]}}
        :enriched;
      const evaluation=amexDecision&&metadata.issuer==='AMEX'
        ?amexDecision.evaluate({plan,product:metadata,answers:known_facts,
          policy:amexPolicy,approvalConfig,offerContext:amexContext?.context,
          marriottResult})
        :chaseDecision&&metadata.issuer==='CHASE'
          ?chaseDecision.evaluate({plan,product:metadata,answers:known_facts,
              policy:chasePolicy,approvalConfig})
          :null;
      // Once a bonus-specific blocker is established, other bonus-history
      // questions cannot change the restriction conclusion. Preserve all
      // independent application-risk questions.
      const bonusBlocked=!!evaluation?.bonus?.triggered_rules?.length;
      const finalPlan=bonusBlocked&&marriottResult?.applicable
        ?{...plan,questionnaire:{...plan.questionnaire,
          specific:plan.questionnaire.specific.filter(q=>
            q.id!=='F03_CARD_HISTORY'&&q.id!=='F07_MARRIOTT_HISTORY'&&
            q.type!=='structured_marriott')}}
        :plan;
      const matrixStatus=bonusBlocked&&marriottResult?.status==='MISSING'
        ?'SKIPPED_AFTER_BONUS_BLOCK':marriottResult?.status;
      return {
        status,identity:{product_id:metadata.product_id,
          name:product.name||String(input||'').trim(),issuer:metadata.issuer,
          customer_type:metadata.customer_type,source:identitySource,
          metadata_completeness:identitySource==='REVIEWED_PRODUCT'?'REVIEWED':
          metadata.formal_nb_card_id?'FORMAL_IDENTITY_ONLY':'PARTIAL',
          formal_nb_card_id:metadata.formal_nb_card_id||null},
        questionnaire:finalPlan,evaluation,marriott_matrix:marriottResult?.applicable
          ?{status:matrixStatus,history_known:marriottResult.history_known,
            pending_ids:bonusBlocked?[]:(marriottResult.pending_ids||[])} :null,
          offer_context:amexContext?.context||null,limitations:{
          full_eligibility_result_available:false,
          offer_terms_verified:amexContext?false:identitySource==='REVIEWED_PRODUCT',
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
      search:lookup.resolve,listCards:lookup.list,plan});
  }
  return Object.freeze({createFacade});
});