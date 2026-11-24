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
            'AMEX-010':'approved_revolving_5d',
            'AMEX-011':'same_product_applied_or_approved_90d'
          })[id]).filter(Boolean));
          output.fields=output.fields.filter(f=>needed.has(f.id));
        }
        if(q.id==='F03_CARD_HISTORY'){
          const choices=new Set();
          for(const rid of output.rule_ids){
            if(!scoped.has(rid))continue;
            for(const name of policy.history_choices_by_rule?.[rid]||[]){
              choices.add(name==='$TARGET'?product.product_name:name);
            }
          }
          output.options=[...choices].filter(Boolean).map(name=>({value:name,label:name}));
          output.allow_none=true;
        }
        if(q.id==='F07_MARRIOTT_HISTORY'){
          output.options=policy.marriott_cross_issuer_history
            .map(name=>({value:name,label:name}));
          output.allow_none=true;
        }
        if(q.id==='F10_ISSUER_PORTFOLIO_COUNT'){
          output.title=product.card_form==='REVOLVING_CREDIT'
            ?'你目前持有多少张 Amex 循环信用卡（Revolving Credit Cards）？'
            :'你目前持有多少张 Amex 签账卡（Charge / Pay Over Time Cards）？';
          output.description+=product.card_form==='REVOLVING_CREDIT'
            ?' Amex 持卡数量阈值不是保证拒批的固定上限。'
            :' 历史数量限制仅作风险参考，不等同银行保证的固定规则。';
        }
        if(q.id==='F08_RELATIONSHIP'){
          const needed=policy.relationship_options?.[product.product_name];
          if(needed)output.title='你是否拥有 '+needed+'？';
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
        const options=new Set();
        for(const id of marriottFamily){
          for(const name of policy.history_choices_by_rule?.[id]||[])options.add(name);
        }
        if(options.size){
          // A standalone F03 is needed only if the planner did not already
          // generate one for same-target lifetime rules.
          specific.push({id:'F03_CARD_HISTORY',type:'multi',
            title:templates.F03_CARD_HISTORY?.title||'你的相关 Marriott 持卡历史',
            description:templates.F03_CARD_HISTORY?.description||'包含过去曾持有的旧版本',
            options:[...options].map(value=>({value,label:value})),
            allow_none:true,rule_ids:marriottFamily});
        }
      }
      const pending=(plan.diagnostics.unresolved_system_gates||[])
        .filter(x=>scoped.has(x.rule_id)).map(x=>({
          rule_id:x.rule_id,
          title:x.rule_id==='AMEX-001'?'目标卡的同产品 Welcome Offer 历史限制':
            x.rule_id.startsWith('AMEX-FL-')?'目标卡的 Family Language':
            x.rule_id.startsWith('AMEX-BIZ-')?'商业卡 Welcome Offer 历史限制':
            'Offer 条款相关限制',
          status:'SYSTEM_TERMS_UNVERIFIED',
          reason:'申请页面的当前具体 Offer 条款尚未核验；不能直接判定该限制存在，也不能据此要求用户作答。',
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