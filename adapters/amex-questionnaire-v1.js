/* Standalone AMEX questionnaire presentation schema based on reviewed Bank Rules.
   No per-card hardcoded questionnaires. No eligibility decisions, persistence or network. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusAmexQuestionnaireV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createEnricher({policy}){
    if(policy?.issuer!=='AMEX'||policy?.source?.rule_ids?.length!==31)
      throw Error('AMEX_31_RULE_POLICY_REQUIRED');
    const scoped=new Set(policy.source.rule_ids);
    const templates=policy.question_templates||{};
    const legacyScope=policy.legacy_variant_scope_by_rule||{};
    const legacyLabels=policy.historical_card_display_labels||{};
    function historyOptions(ruleIds,target){
      const choices=new Map();
      for(const rid of ruleIds){
        if(!scoped.has(rid))continue;
        const originals=new Set((legacyScope[rid]||[]).map(x=>
          x==='$TARGET'?target.product_name:x));
        for(const raw of policy.history_choices_by_rule?.[rid]||[]){
          const name=raw==='$TARGET'?target.product_name:raw;
          if(!name)continue;
          const label=originals.has(name)?name+'（包括以前的版本）':
            legacyLabels[name]||name;
          const previous=choices.get(name);
          // Keep the most informative label if this card belongs to multiple rules.
          if(!previous||originals.has(name))choices.set(name,{value:name,label});
        }
      }
      return [...choices.values()];
    }
    function enrich({plan,product,known_facts={}}){
      if(!product||product.issuer!=='AMEX')return plan;
      if(!plan?.questionnaire||!plan?.diagnostics)
        throw Error('QUESTIONNAIRE_PLAN_REQUIRED');
      const original=plan.questionnaire;
      const specific=original.specific.map(q=>{
        const template=templates[q.id];
        if(!template)return q;
        const marriottFamilyIds=(plan.diagnostics.applicable_rule_ids||[])
          .filter(id=>['AMEX-FL-012','AMEX-FL-013','AMEX-BIZ-005'].includes(id));
        const extended=q.id==='F03_CARD_HISTORY'
          ?[...new Set([...q.rule_ids,...marriottFamilyIds])]:q.rule_ids;
        const output={...q,...template,rule_ids:extended};
        if(q.id==='F02_ISSUER_APPLICATION_HISTORY'&&output.fields){
          const needed=new Set(q.rule_ids.map(id=>({
            'AMEX-006':'approved_revolving_90d',
            'AMEX-011':'same_product_applied_or_approved_90d'
          })[id]).filter(Boolean));
          output.fields=output.fields.filter(f=>needed.has(f.id));
        }
        if(q.id==='F03_CARD_HISTORY'){
          output.options=historyOptions(output.rule_ids,product);
          output.allow_none=true;
        }
        if(q.id==='F07_MARRIOTT_HISTORY'){
          output.options=policy.marriott_cross_issuer_history
            .map(name=>({value:name,label:name}));
          output.allow_none=true;
        }
        if(q.id==='F10_ISSUER_PORTFOLIO_COUNT'){
          output.title=product.card_form==='REVOLVING_CREDIT'
            ?'你现在有几张 Amex 普通信用卡？（个人卡、商业卡都算）'
            :'你现在有几张 Amex Platinum、Gold 这类签账卡？';
          output.description+=product.card_form==='REVOLVING_CREDIT'
            ?' 这里只算自己名下的主卡，不算副卡。5 张是经验参考，不是一定会拒批的硬上限。'
            :' 这里只算自己名下的主卡，不算副卡。10 张是经验参考，并非一刀切的上限。';
        }
        if(q.id==='F08_RELATIONSHIP'){
          const needed=policy.relationship_options?.[product.product_name];
          if(needed)output.title='你有'+needed+'吗？';
        }
        return output;
      });
      // Marriott family clauses use held-card history, separately from the
      // cross-issuer matrix's dated F07 history. NLL never removes a retained
      // family clause. Deduplicate F03 if already present.
      const marriottFamily=(plan.diagnostics.applicable_rule_ids||[])
        .filter(id=>['AMEX-FL-012','AMEX-FL-013','AMEX-BIZ-005'].includes(id));
      const alreadyPresent=plan.questionnaire.specific.some(q=>q.id==='F03_CARD_HISTORY');
      const knownHistory=known_facts&&Object.prototype.hasOwnProperty.call(known_facts,'F03_CARD_HISTORY')&&
        Array.isArray(known_facts.F03_CARD_HISTORY)&&known_facts.F03_CARD_HISTORY.length>0;
      if(marriottFamily.length&&!alreadyPresent&&!knownHistory){
        const options=historyOptions(marriottFamily,product);
        if(options.length){
          // A standalone F03 is needed only if the planner did not already
          // generate one for same-target lifetime rules.
          specific.push({id:'F03_CARD_HISTORY',type:'multi',
            title:templates.F03_CARD_HISTORY?.title||'下面这些 Marriott 卡，你以前办过哪些？',
            description:templates.F03_CARD_HISTORY?.description||'已经关掉的卡、旧版卡也算',
            options,
            allow_none:true,rule_ids:marriottFamily});
        }
      }
      const pending=(plan.diagnostics.unresolved_system_gates||[])
        .filter(x=>scoped.has(x.rule_id)).map(x=>({
          rule_id:x.rule_id,
          title:x.rule_id==='AMEX-001'?'这张卡以前办过，会不会影响开卡奖励':
            x.rule_id.startsWith('AMEX-FL-')?'同系列信用卡的开卡奖励限制':
            x.rule_id.startsWith('AMEX-BIZ-')?'商业卡以前办过，会不会影响开卡奖励':
            '这次开卡奖励的特殊限制',
          status:'SYSTEM_TERMS_UNVERIFIED',
          reason:'还没有核实这次申请链接的具体条款，所以暂时不能根据这一条判断奖励资格。',
          potential_fact_groups:[],
          history_scope:policy.history_choices_by_rule?.[x.rule_id]?.map(v=>
            v==='$TARGET'?product.product_name:v)||[]
        }));
      return {...plan,questionnaire:{...original,specific,pending_terms:pending},
        diagnostics:{...plan.diagnostics,issuer_rules_documented:scoped.size,
          amex_offer_terms_pending:pending.length},
        evaluation_ready:false};
    }
    return Object.freeze({enrich});
  }
  return Object.freeze({createEnricher,version:'1'});
});