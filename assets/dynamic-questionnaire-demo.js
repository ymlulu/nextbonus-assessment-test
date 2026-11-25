(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const answers=Object.create(null);
  let facade=null,selectedProductId='',cards=[],loading=false;
    function el(tag,cls,text){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!=null)n.textContent=text;
    return n;
  }
  const readableRuleNames=Object.create(null);
  function ruleLabel(id){
    return readableRuleNames[id]?id+'（'+readableRuleNames[id]+'）':id;
  }
  let ruleStates={},riskStates={},outcomeStates={};
  let language=null,copy={};
  const t=k=>copy[k]??k;
  // All grouped time answers are stored under the existing per-card facts.
  // A newly selected historical card has no answer until explicitly confirmed.
  function groupFact(item,priorId){
    return answers[item.details_id]?.[priorId]?.[item.fact_field];
  }
  function patchGroupFacts(item,choiceIds,valueFor){
    const groups={...(answers[item.details_id]||{})};
    for(const id of choiceIds){
      const row={...(groups[id]||{})};
      const value=valueFor(id);
      if(value==='YES'||value==='NO')row[item.fact_field]=value;
      else delete row[item.fact_field];
      // A close date only applies while the card is no longer held.
      if(value!=='NO')for(const dependent of item.clear_when_not_no||[])delete row[dependent];
      if(Object.keys(row).length)groups[id]=row;
      else delete groups[id];
    }
    return groups;
  }
  function setGroupedDetails(item,groups){
    if(Object.keys(groups).length)answers[item.details_id]=groups;
    else delete answers[item.details_id];
  }
  function minusAnswer(item,field,choiceValue){
    const previous={...answers};
    if(item.type==='structured'&&field){
      const previousFields={...(answers[item.id]||{})};
      delete previousFields[field];
      if(Object.keys(previousFields).length)previous[item.id]=previousFields;
      else delete previous[item.id];
    }else if(item.type==='marriott_multi'){
      const ids=item.options.map(o=>o.value)
        .filter(id=>choiceValue===undefined||choiceValue==='NONE'||id===choiceValue);
      const previousGroups=patchGroupFacts(item,ids,()=>undefined);
      if(Object.keys(previousGroups).length)previous[item.details_id]=previousGroups;
      else delete previous[item.details_id];
    }else if(choiceValue!==undefined&&Array.isArray(answers[item.id])){
      const remaining=answers[item.id].filter(value=>value!==choiceValue);
      if(remaining.length)previous[item.id]=remaining;
      else delete previous[item.id];
    }else delete previous[item.id];
    return previous;
  }
  function hasAnswer(item,field){
    if(item.type==='structured')return answers[item.id]?.[field]!==undefined &&
      answers[item.id]?.[field]!=='';
    if(item.type==='marriott_multi')
      return item.options.some(o=>['YES','NO'].includes(groupFact(item,o.value)));
    const value=answers[item.id];
    return value!==undefined&&value!==''&&value!==null&&
      (!Array.isArray(value)||value.length>0);
  }
  // Red feedback comes from rule-engine evidence and actual before/after
  // evaluation. A checked choice may independently trigger an OR condition
  // even when another answer already produces the same final status.
  function impactFor(item,current,field,choiceValue){
    if(!hasAnswer(item,field)||!facade||!selectedProductId)return '';
    const previous=facade.plan({product_id:selectedProductId,
      known_facts:minusAnswer(item,field,choiceValue),
      offer_variant:$('offer-variant').value});
    const a=previous.evaluation,b=current.evaluation;
    if(!a||!b)return '';
    const effects=[];
    if(item.base_credit){
      if(a.application.base_risk!==b.application.base_risk)
        effects.push(t("credit_change")+(riskStates[a.application.base_risk]||t("pending_calculation"))+
          ' → '+(riskStates[b.application.base_risk]||t("pending_calculation")));
    }
    const oldMap=new Map((a.rule_results||[]).map(x=>[x.rule_id,x]));
    const newMap=new Map((b.rule_results||[]).map(x=>[x.rule_id,x]));
    const scoped=item.type==='marriott_multi'&&choiceValue!==undefined&&choiceValue!=='NONE'
      ?(item.options.find(o=>o.value===choiceValue)?.rule_ids||item.rule_ids||[])
      :field?(item.fields?.find(f=>f.id===field)?.rule_ids||item.rule_ids||[]):(item.rule_ids||[]);
    const matching=id=>scoped.includes(id);
    const all=[...new Set([...oldMap.keys(),...newMap.keys()])]
      .filter(matching);
    for(const id of all){
      const before=oldMap.get(id)?.status||'MISSING';
      const rule=newMap.get(id);
      const after=rule?.status||'MISSING';
      const sources=(rule?.trigger_sources||[]).filter(x=>x.question_id===item.id&&
        choiceValue!==undefined&&x.value===choiceValue);
      if(after==='TRIGGERED'&&sources.length){
        const consequence=rule.product_eligibility?t("both_block"):
          rule.hard_bonus_eligibility?t("outcome_bonus_block"):
          rule.configured_bonus_impact>0?t("bonus_may_impact"):t("application_may_impact");
        effects.push(ruleLabel(id)+'：'+sources.map(x=>x.reason).join('、')+'，'+consequence);
      }
      if(before!==after)effects.push(ruleLabel(id)+'：'+
        (ruleStates[before]||t("not_applicable"))+' → '+
        (after==='TRIGGERED'&&rule?.product_eligibility?t("product_block"):
         ruleStates[after]||t("not_applicable")));
    }
    const oldApp=a.application.status,newApp=b.application.status;
    const oldBonus=a.bonus.status,newBonus=b.bonus.status;
    if(oldApp!==newApp)
      effects.push(t("application_change")+(outcomeStates[oldApp]||oldApp)+
        ' → '+(outcomeStates[newApp]||newApp));
    if(oldBonus!==newBonus)
      effects.push(t("bonus_change")+(outcomeStates[oldBonus]||oldBonus)+
        ' → '+(outcomeStates[newBonus]||newBonus));
    if(!effects.length)return '';
    return effects.slice(0,3).join('；')+
      (effects.length>3?t("other_changes_prefix")+(effects.length-3)+t("other_changes_suffix"):'');
  }
  function feedback(item,result,field,choiceValue){
    if(!hasAnswer(item,field))return null;
    const summary=impactFor(item,result,field,choiceValue);
    if(summary)return el('span','rule-delta',summary);
    return el('span','rule-unchanged',
      result.evaluation?t("answer_no_change"):t("answer_no_comparison"));
  }
  function optionsForQuestion(item,result){
    const select=el('select');
    const empty=el('option','',t("choose"));empty.value='';
    select.append(empty);
    for(const option of item.options||[]){
      const node=el('option','',option.label);node.value=option.value;
      if(answers[item.id]===option.value)node.selected=true;
      select.append(node);
    }
    // Explicitly set the controlled select value, including after DOM rebuild.
    select.value=answers[item.id]||'';
    select.addEventListener('change',()=>{
      if(select.value)answers[item.id]=select.value;
      else delete answers[item.id];
      render();
    });
    const row=el('div','choice-inline');
    row.append(select);
    const note=feedback(item,result);
    if(note)row.append(note);
    return row;
  }
  function countSelector({value,bands,max=99,commit}){
    const row=el('div','count-picker');
    // Keep the selected interval, not a guessed exact count. If a later
    // threshold splits it, ask for a narrower selection.
    // Bands come from issuer question schemas; the UI owns no bank thresholds.
    if(Array.isArray(bands)&&bands.length){
      const select=el('select');
      select.append(option('',t("choose")));
      for(const band of bands)select.append(option(String(band.value),band.label));
      const range=Number.isInteger(value)?{min:value,max:value}:value;
      const index=range&&Number.isInteger(range.min)?bands.findIndex((b,i)=>b.value<=range.min&&
        (i===bands.length-1||range.max!==null&&Number.isInteger(range.max)&&range.max<bands[i+1].value)):-1;
      select.value=index>=0?String(bands[index].value):'';
      select.addEventListener('change',()=>{
        const i=bands.findIndex(b=>String(b.value)===select.value);
        commit(i<0?null:{min:bands[i].value,max:i+1<bands.length?bands[i+1].value-1:null});
      });
      row.append(select);
    }else{
      // For a future fact that genuinely needs an exact count, use a simple
      // numeric input, not a fabricated set of thresholds or dozens of options.
      const number=el('input');number.type='number';number.min='0';
      number.max=String(max);number.step='1';number.placeholder=t("count_placeholder");
      number.value=Number.isInteger(value)?String(value):'';
      number.addEventListener('change',()=>{
        if(number.value===''){commit(null);return;}
        if(/^\d+$/.test(number.value)&&Number(number.value)<=max)commit(Number(number.value));
      });
      row.append(number);
    }
    return row;
  }
  function yesNoOptions({options,value,commit}){
    const select=el('select');
    select.append(option('',t("choose")));
    for(const item of options||[])select.append(option(item.value,item.label));
    select.value=value||'';
    select.addEventListener('change',()=>commit(select.value||null));
    return select;
  }
  function question(item,common=false,result,active=true){
    const card=el('section','question');
    const head=el('div','question-head');
    head.append(el('strong','',item.title));
    head.append(el('span','muted',!active?t("answered"):
      common?t("credit_question"):t("specific_question")));
    card.append(head);
    if(item.description)card.append(el('p','small',item.description));
    if(item.type==='marriott_multi'){
      const options=el('div','choice-list');
      const ids=item.options.map(o=>o.value);
      const selected=new Set(ids.filter(id=>groupFact(item,id)==='YES'));
      const allNo=ids.length>0&&ids.every(id=>groupFact(item,id)==='NO');
      const hasUnknown=ids.some(id=>!['YES','NO'].includes(groupFact(item,id)));
      function commit(yes,clear=false){
        setGroupedDetails(item,patchGroupFacts(item,ids,id=>clear?undefined:yes.has(id)?'YES':'NO'));
        render();
      }
      for(const choice of [...item.options,{value:'NONE',label:t("none")}]){
        const label=el('label','check-option');
        const box=el('input');box.type='checkbox';box.value=choice.value;
        box.checked=choice.value==='NONE'?allNo:selected.has(choice.value);
        box.addEventListener('change',()=>{
          const next=new Set(selected);
          if(choice.value==='NONE'){commit(new Set(),!box.checked);return;}
          if(box.checked)next.add(choice.value);
          else next.delete(choice.value);
          commit(next,!next.size);
        });
        label.append(box,document.createTextNode(choice.label));
        if(box.checked){
          const note=feedback(item,result,undefined,choice.value);
          if(note)label.append(note);
        }
        options.append(label);
      }
      card.append(options);
      // If history was expanded after an earlier answer, an unchanged
      // selection needs an explicit confirmation for the new option(s).
      if(hasUnknown&&ids.some(id=>['YES','NO'].includes(groupFact(item,id)))){
        const confirm=el('button','secondary',t("confirm_choices"));confirm.type='button';
        confirm.addEventListener('click',()=>commit(selected));
        card.append(confirm);
      }
    }else if(item.type==='structured'&&Array.isArray(item.fields)){
      const entry=answers[item.id]&&typeof answers[item.id]==='object'?answers[item.id]:{};
      for(const field of item.fields){
        const line=el('div','field-line');
        const label=el('label','structured-field',field.label);
        const commit=value=>{
          const next={...(answers[item.id]||{})};
          if(value===null||value==='')delete next[field.id];
          else next[field.id]=value;
          if(Object.keys(next).length)answers[item.id]=next;
          else delete answers[item.id];
          render();
        };
        const control=field.type==='number'?
          countSelector({value:entry[field.id],bands:field.count_bands,max:field.max??30,commit}):
          yesNoOptions({options:field.options,value:entry[field.id],commit});
        label.append(control);line.append(label);
        const note=feedback(item,result,field.id);
        if(note)line.append(note);
        card.append(line);
      }
    }else if((common||item.type==='single')&&item.options?.length){
      card.append(optionsForQuestion(item,result));
    }else if(item.type==='multi'&&item.options?.length){
      const options=el('div','choice-list');
      const existing=Array.isArray(answers[item.id])?answers[item.id]:[];
      const values=[...item.options,...(item.allow_none?
        [{value:'NONE',label:t("none")}]:[])];
      for(const choice of values){
        const label=el('label','check-option');
        const box=el('input');box.type='checkbox';box.value=choice.value;
        box.checked=existing.includes(choice.value);
        box.addEventListener('change',()=>{
          const selected=new Set(Array.isArray(answers[item.id])?answers[item.id]:[]);
          if(box.checked){
            if(choice.value==='NONE')selected.clear();
            else selected.delete('NONE');
            selected.add(choice.value);
          }else selected.delete(choice.value);
          if(selected.size)answers[item.id]=[...selected];
          else delete answers[item.id];
          if(item.details_id){
            const activePriors=new Set(item.options.filter(o=>selected.has(o.value)).map(o=>o.prior_id));
            const groups={...(answers[item.details_id]||{})};
            for(const id of Object.keys(groups))if(!activePriors.has(id))delete groups[id];
            if(Object.keys(groups).length)answers[item.details_id]=groups;
            else delete answers[item.details_id];
          }
          render();
        });
        label.append(box,document.createTextNode(choice.label));
        if(box.checked){
          const note=feedback(item,result,undefined,
            choice.value);
          if(note)label.append(note);
        }
        options.append(label);
      }
      card.append(options);
    }else if(item.type==='number'){
      const row=el('div','choice-inline');
      row.append(countSelector({value:answers[item.id],bands:item.count_bands,max:item.max??99,
        commit:value=>{
          if(value===null)delete answers[item.id];
          else answers[item.id]=value;
          render();
        }}));
      const note=feedback(item,result);if(note)row.append(note);
      card.append(row);
    }else{
      // Unstructured facts in the 129-rule source cannot safely be invented
      // as Yes/No questions. Retain their source-owned free-text fallback.
      const input=el('input');input.type='text';
      input.placeholder=t("free_text_placeholder");
      input.value=String(answers[item.id]??'');
      const button=el('button','secondary',t("save_answer"));button.type='button';
      button.addEventListener('click',()=>{
        if(input.value.trim())answers[item.id]=input.value.trim();
        else delete answers[item.id];
        render();
      });
      const row=el('div','input-row');row.append(input,button);
      const note=feedback(item,result);if(note)row.append(note);
      card.append(row);
    }
    if(item.rule_ids?.length)
      card.append(el('p','small',t("rule_ids")+item.rule_ids.map(ruleLabel).join('、')));
    return card;
  }
  const ISSUER_LABELS={
    AMEX:'American Express',CHASE:'Chase',CITI:'Citi',
    CAPITAL_ONE:'Capital One',BOFA:'Bank of America',US_BANK:'U.S. Bank',
    WELLS_FARGO:'Wells Fargo',BARCLAYS:'Barclays',DISCOVER:'Discover',COLUMN_NA:'Bilt / Column'
  };
  function option(value,label){
    const n=el('option','',label);
    n.value=value;return n;
  }
  function resetAnswers(){
    for(const key of Object.keys(answers))delete answers[key];

  }
  function clearReport(note=t("select_first")){
    $('summary').textContent=note;
    $('questions').replaceChildren();
    $('assessment-result').replaceChildren();
    $('identity-note').textContent='';
    $('scope').textContent='';
    $('gaps').textContent='';
    $('amex-offer-settings').hidden=true;
  }
  function fillSelect(select,placeholder,options){
    select.replaceChildren(option('',placeholder));
    for(const item of options)select.append(option(item.value,item.label));
  }
  function populateBanks(){
    const issuer=$('issuer');
    const known=[...new Set(cards.map(p=>p.issuer).filter(Boolean))]
      .sort((a,b)=>(ISSUER_LABELS[a]||a).localeCompare(ISSUER_LABELS[b]||b));
    fillSelect(issuer,t("choose_bank"),known.map(key=>({
      value:key,label:ISSUER_LABELS[key]||key
    })));
    issuer.disabled=false;
    $('customer-type').disabled=true;
    $('card-select').disabled=true;
    $('generate').disabled=true;
  }
  function populateTypes(){
    const bank=$('issuer').value,type=$('customer-type');
    const available=[...new Set(cards.filter(p=>p.issuer===bank)
      .map(p=>p.customer_type).filter(Boolean))];
    fillSelect(type,t("choose_customer_type"),[
      {value:'PERSONAL',label:t("personal")},
      {value:'BUSINESS',label:t("business")}
    ].filter(v=>available.includes(v.value)));
    type.disabled=!bank;
    fillSelect($('card-select'),t("choose_type_first"),[]);
    $('card-select').disabled=true;
    selectedProductId='';
    $('generate').disabled=true;
    resetAnswers();clearReport(bank?t("choose_type"):t("choose_bank"));
  }
  function populateCards(){
    const issuer=$('issuer').value,type=$('customer-type').value;
    const select=$('card-select');
    const matches=cards.filter(p=>p.issuer===issuer&&p.customer_type===type)
      .sort((a,b)=>a.name.localeCompare(b.name,'en'));
    fillSelect(select,t("choose_card"),matches.map(p=>({
      value:p.product_id,label:p.name
    })));
    select.disabled=!type||!matches.length;
    selectedProductId='';
    $('generate').disabled=true;
    resetAnswers();
    clearReport(matches.length?t("choose_credit_card"):t("no_cards"));
  }
  function selectCard(){
    const id=$('card-select').value;
    const matched=cards.find(p=>p.product_id===id);
    selectedProductId=matched&&matched.issuer===$('issuer').value&&
      matched.customer_type===$('customer-type').value?id:'';
    $('generate').disabled=!selectedProductId;
    resetAnswers();
    if(selectedProductId){
      $('offer-variant').value='STANDARD';
      render();
    }else clearReport();
  }
  function render(){
    if(!facade||!selectedProductId)return;
    const result=facade.evaluate({product_id:selectedProductId,
      known_facts:answers,offer_variant:$('offer-variant').value});
    const status=$('summary'),list=$('questions');
    if(!result.questionnaire){
      clearReport(t("card_error")+(result.status||t("choose_again")));
      return;
    }
    $('amex-offer-settings').hidden=result.identity.issuer!=='AMEX';
    const plan=result.questionnaire,info=plan.diagnostics;
    const label=result.identity.name;
    status.textContent=label+t("applicable_prefix")+info.applicable_rule_ids.length+
      t("unverified_prefix")+(info.unresolved_system_gates.length+
      info.unresolved_target_mappings.length)+t("missing_prefix")+
      plan.questionnaire.specific.length+t("groups_suffix");
    const source={
      REVIEWED_PRODUCT:t("source_reviewed"),
      EXPANSION_CANDIDATE:t("source_candidate"),
      HISTORY_ONLY:t("source_history"),
      NB_FORMAL_CATALOG:t("source_catalog"),
      USER_SUPPLIED_PARTIAL:t("source_partial")
    }[result.identity.source]||result.identity.source;
    $('identity-note').textContent=t("identity_source")+(result.identity.formal_nb_card_id
      ?t("source_catalog_identity"):source)+
      '。'+(result.offer_context
        ?(ISSUER_LABELS[result.identity.issuer]||result.identity.issuer)+t("offer_scenario")+(result.offer_context.variant==='NLL'
          ?t("nll_on"):'。')
        +t("offer_assumption")
        :(ISSUER_LABELS[result.identity.issuer]||result.identity.issuer)+t("offer_default_assumption"));
    // The rule planner intentionally returns only unanswered facts, but this
    // QA page keeps all previously displayed questions editable and visible.
    const activeIds=new Set([...plan.questionnaire.common,...plan.questionnaire.specific].map(q=>q.id));
    list.replaceChildren(el('h2','',t("common_heading")));
    const allQuestions=plan.questionnaire.editable;
    for(const q of allQuestions.filter(q=>q.section==='common'))list.append(question(q,true,result,activeIds.has(q.id)));
    list.append(el('h2','',t("specific_heading")));
    const currentQuestions=allQuestions.filter(q=>q.section==='specific');
    if(!currentQuestions.length)list.append(el('p','muted',t("no_specific")));
    for(const q of currentQuestions)list.append(question(q,false,result,activeIds.has(q.id)));
    const report=$('assessment-result');
    report.replaceChildren();
    if(result.report){
      const full=result.report,d={issuer:full.product.issuer,offer_variant:full.offer_variant,...full.dimensions,rule_results:full.rule_results};
      const issuerLabel=ISSUER_LABELS[d.issuer]||d.issuer;
      report.append(el('h2','',t("result_heading_prefix")+issuerLabel+t("result_heading_suffix")));
      const decision=el('section','assessment-panel decision-card');
      decision.append(el('h3','decision-title decision-'+full.decision.code.toLowerCase(),full.decision.label));
      if(full.decision.code==='CLEAR'||!full.decision.reasons?.length)decision.append(el('p','decision-summary',full.decision.summary));
      if(full.decision.reasons?.length){
        decision.append(el('strong','decision-why',full.decision.code==='REVIEW'?t("review_heading"):t("reasons_heading")));
        const why=el('ul','decision-reasons');
        for(const reason of full.decision.reasons)why.append(el('li','',reason.text));
        decision.append(why);
      }
      decision.append(el('p','small',full.decision.note));
      report.append(decision);
      const summary=el('div','assessment-summary');
      const app=el('section','assessment-panel');
      app.append(el('strong','',t("application_heading")));
      app.append(el('p',['PRODUCT_INELIGIBLE','APPLICATION_INELIGIBLE','WAIT'].includes(d.application.status)?'rule-delta':'',d.application.message));
      app.append(el('p','small',t("application_impact")+d.application.impact+'/3 · '+({WAIT:t("action_wait"),BLOCK:t("action_block"),RISK:t("action_risk"),UNKNOWN:t("action_unknown"),CLEAR:t("action_clear")}[d.application.action]||d.application.action)));
      app.append(el('p','small',t("base_heading")+({
        HIGH:t("credit_high"),MEDIUM:t("credit_medium"),HIGH_RISK:t("credit_high_risk"),
        INSUFFICIENT_DATA:t("credit_unknown")
      })[d.application.base_risk]+t("base_not_probability")));
      const unfinished=d.application.unresolved_rules||[];
      if(unfinished.length){
        app.append(el('p','small',issuerLabel+t("issuer_rules")+
          unfinished.filter(x=>x.status==='MISSING').length+t("unanswered_suffix")+
          unfinished.filter(x=>x.status==='REVIEW').length+t("review_suffix")));
        const detail=el('details','approval-gaps');
        detail.append(el('summary','',t("unconfirmed_prefix")+unfinished.length+t("items_suffix")));
        for(const row of unfinished){
          detail.append(el('p','small',ruleLabel(row.rule_id)+' · '+
            (row.status==='MISSING'?t("not_answered"):t("needs_verification"))+'：'+row.reason));
        }
        app.append(detail);
      }else if(d.application.base_completed){
        app.append(el('p','small',t("rules_complete_prefix")+issuerLabel+t("rules_complete_suffix")));
      }
      const bonus=el('section','assessment-panel');
      bonus.append(el('strong','',t("bonus_heading")));
      bonus.append(el('p',['PRODUCT_INELIGIBLE','BONUS_INELIGIBLE'].includes(d.bonus.status)?'rule-delta':'',d.bonus.message));
      bonus.append(el('p','small',t("bonus_impact")+d.bonus.impact+'/3 · '+({WAIT:t("action_wait"),BLOCK:t("action_block"),RISK:t("action_risk"),UNKNOWN:t("action_unknown"),CLEAR:t("action_clear")}[d.bonus.action]||d.bonus.action)));
      if(!d.bonus.complete)bonus.append(el('p','small',t("bonus_pending")));
      bonus.append(el('p','small',t("offer_type_prefix")+(d.offer_variant==='NLL'?t("nll_offer"):t("standard_offer"))));
      summary.append(app,bonus);
      const itemized=el('details','rule-report');
      itemized.append(el('summary','',t("full_report_prefix")+d.rule_results.length+t("rules_suffix")),summary);
      for(const rule of d.rule_results){
        const desc=el('p','small',
          ruleLabel(rule.rule_id)+' · '+({TRIGGERED:rule.product_eligibility?t("product_block"):rule.hard_bonus_eligibility?t("outcome_bonus_block"):t("state_triggered"),CLEAR:t("not_triggered"),
            MISSING:t("not_answered"),REVIEW:t("needs_verification")})[rule.status]+' · '+rule.reason);
        itemized.append(desc);
      }
      const history=el('section','assessment-panel');
      history.append(el('strong','',t("history_heading")),el('p','small',t("history_note")));
      const historyButton=el('button','secondary',t("history_button"));
      historyButton.type='button';
      const historyContent=el('div','small');
      historyButton.addEventListener('click',async()=>{
        historyButton.disabled=true;historyContent.replaceChildren(el('p','small',t("history_loading")));
        try{
          const data=await window.NextBonusAssessmentLoaderV2.history();
          const h=facade.getOfferHistory({product_id:full.product.product_id,offerHistory:data});
          historyContent.replaceChildren();
          if(!h){historyContent.append(el('p','small',t("history_empty")));return;}
          historyContent.append(el('p','small',t("history_date")+h.reference_date+' · '+h.reference_offer.offer_label));
          for(const row of h.history.slice(-10).reverse())historyContent.append(el('p','small',row.date_label+' · '+row.bonus_label+(row.spend_requirement?' · '+row.spend_requirement:'')));
          if(h.history.length>10)historyContent.append(el('p','small',t("history_limit")));
        }catch{historyContent.replaceChildren(el('p','small',t("history_error")));}
        finally{historyButton.disabled=false;}
      });
      history.append(historyButton,historyContent);itemized.append(history);
      itemized.append(el('p','small',t("benefits_note")));
      itemized.append(el('p','small',full.caveat));
      report.append(itemized);
      if(full.marriott_matrix){
        const pending=full.marriott_matrix;
        itemized.append(el('p','small',(d.issuer==='CHASE'?t("marriott_application"):t("marriott_bonus"))+
          ({CLEAR:t("matrix_clear"),TRIGGERED:t("matrix_triggered"),
             MISSING:t("matrix_missing"),
             SKIPPED_AFTER_BONUS_BLOCK:t("matrix_skipped"),
             NOT_APPLICABLE:t("matrix_na")})[pending.status]+t("matrix_note")));
      }
    }
    $('scope').textContent=t("scope_prefix")+info.applicable_rule_ids.join('、');
    $('gaps').textContent=t("gaps_prefix")+
      (info.unresolved_system_gates.map(x=>x.rule_id).join('、')||t("none_debug"))+
      t("identity_gaps")+(info.unresolved_target_mappings.map(x=>x.rule_id).join('、')||t("none_debug"))+
      (info.answer_conflicts.length?t("conflicts_prefix")+info.answer_conflicts.map(x=>x.message).join('；'):'');
  }
  async function start(){
    if(loading)return;
    loading=true;
    $('retry').hidden=true;
    $('summary').textContent=copy.loading||'正在加载卡片和申请规则…';
    $('generate').disabled=true;
    try{
      const {client,formalAmex,messages}=await window.NextBonusAssessmentLoaderV2.load();
      language=messages;copy=language.ui;
      ({ruleStates,riskStates,outcomeStates}=language.states);
      for(const node of document.querySelectorAll?.('[data-copy]')||[]){const k=node.getAttribute('data-copy');if(language.shell[k]!==undefined)node.textContent=language.shell[k];}
      for(const node of document.querySelectorAll?.('[data-copy-aria]')||[]){const k=node.getAttribute('data-copy-aria');if(language.shell[k]!==undefined)node.setAttribute('aria-label',language.shell[k]);}
      if(language.shell.document_title)document.title=language.shell.document_title;
      facade=client;
      Object.assign(readableRuleNames,client.ruleLabels);
      const formalNames=new Map((formalAmex.products||[]).map(x=>[x.assessment_product_id,x.display_name]));
      cards=facade.listCards().filter(p=>p.issuer&&p.customer_type)
        .map(p=>({...p,name:formalNames.get(p.product_id)||p.name}));
      $('version').textContent=t("version_prefix")+client.getVersion().release_id+' · '+client.getVersion().rules_indexed+t("version_separator")+cards.length+t("version_cards");
      populateBanks();
      // Start at the most mature coverage area, but never silently choose
      // a specific card or execute an unrelated old evaluation.
      $('issuer').value='AMEX';
      populateTypes();
      $('customer-type').value='PERSONAL';
      populateCards();
    }catch(error){
      facade=null;cards=[];selectedProductId='';
      clearReport((copy.boot_error||'初始化失败：')+(error?.message||copy.unknown_error||'未知错误'));
      $('retry').hidden=false;
      $('issuer').disabled=true;$('customer-type').disabled=true;
      $('card-select').disabled=true;
      $('version').textContent=copy.boot_failed||'未完成加载；不会显示旧卡片或旧评估结果';
    }finally{loading=false;}
  }
  $('issuer').addEventListener('change',populateTypes);
  $('customer-type').addEventListener('change',populateCards);
  $('card-select').addEventListener('change',selectCard);
  $('generate').addEventListener('click',()=>{
    if(selectedProductId){resetAnswers();render();}
  });
  $('reset').addEventListener('click',()=>{
    resetAnswers();
    if(selectedProductId)render();
    else clearReport();
  });
  $('offer-variant').addEventListener('change',()=>{
    resetAnswers();if(selectedProductId)render();
  });
  $('retry').addEventListener('click',start);
  start();
})();