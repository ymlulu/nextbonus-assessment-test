(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const answers=Object.create(null);
  let facade=null,selectedProductId='',cards=[],loading=false;
  let baseQuestionLibrary=[];
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
  const ruleStates={MISSING:'待补充',REVIEW:'待核实',
    TRIGGERED:'可能受限',CLEAR:'未发现限制'};
  const riskStates={HIGH:'优秀（最高档）',MEDIUM:'一般',
    HIGH_RISK:'偏高风险',INSUFFICIENT_DATA:'还没算出来'};
  const outcomeStates={MODEL_ONLY:'已检查',INSUFFICIENT_DATA:'尚未完成',
    WAIT:'需等待限制解除',APPLICATION_INELIGIBLE:'不符合申请条件',ELEVATED_RISK:'有需要注意的申请风险',PRODUCT_INELIGIBLE:'不符合当前产品条件',BONUS_INELIGIBLE:'不符合开卡奖励条件',
    NO_TRIGGER_FOUND:'未发现开卡奖励限制',NEEDS_REVIEW:'开卡奖励还要确认',
    LIKELY_RESTRICTED:'可能拿不到奖励'};
  
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
    if(item.id.startsWith('a')&&/^a[1-4]$/.test(item.id)){
      if(a.application.base_risk!==b.application.base_risk)
        effects.push('基础信用档位：'+(riskStates[a.application.base_risk]||'待计算')+
          ' → '+(riskStates[b.application.base_risk]||'待计算'));
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
        const consequence=rule.product_eligibility?'不符合申请及开卡奖励条件':
          rule.hard_bonus_eligibility?'不符合开卡奖励条件':
          rule.configured_bonus_impact>0?'可能影响开卡奖励':'可能影响申请';
        effects.push(ruleLabel(id)+'：'+sources.map(x=>x.reason).join('、')+'，'+consequence);
      }
      if(before!==after)effects.push(ruleLabel(id)+'：'+
        (ruleStates[before]||'未适用')+' → '+
        (after==='TRIGGERED'&&rule?.product_eligibility?'不符合产品申请条件':
         ruleStates[after]||'未适用'));
    }
    const oldApp=a.application.status,newApp=b.application.status;
    const oldBonus=a.bonus.status,newBonus=b.bonus.status;
    if(oldApp!==newApp)
      effects.push('申请风险：'+(outcomeStates[oldApp]||oldApp)+
        ' → '+(outcomeStates[newApp]||newApp));
    if(oldBonus!==newBonus)
      effects.push('开卡奖励：'+(outcomeStates[oldBonus]||oldBonus)+
        ' → '+(outcomeStates[newBonus]||newBonus));
    if(!effects.length)return '';
    return effects.slice(0,3).join('；')+
      (effects.length>3?'；另有 '+(effects.length-3)+' 项变化':'');
  }
  function feedback(item,result,field,choiceValue){
    if(!hasAnswer(item,field))return null;
    const summary=impactFor(item,result,field,choiceValue);
    if(summary)return el('span','rule-delta',summary);
    return el('span','rule-unchanged',
      result.evaluation?'这项回答暂时不会改变评估结果':'这张卡暂时只能查看问题，还不能比较评估结果');
  }
  function optionsForQuestion(item,result){
    const select=el('select');
    const empty=el('option','','请选择');empty.value='';
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
    // A band stores its lower-bound representative. Rule results must only
    // describe the band, never claim that its representative is an exact count.
    // Bands come from issuer question schemas; the UI owns no bank thresholds.
    if(Array.isArray(bands)&&bands.length){
      const select=el('select');
      select.append(option('','请选择'));
      for(const band of bands)select.append(option(String(band.value),band.label));
      const chosen=Number.isInteger(value)?bands.filter(b=>b.value<=value).at(-1):null;
      select.value=chosen?String(chosen.value):'';
      select.addEventListener('change',()=>commit(select.value===''?null:Number(select.value)));
      row.append(select);
    }else{
      // For a future fact that genuinely needs an exact count, use a simple
      // numeric input, not a fabricated set of thresholds or dozens of options.
      const number=el('input');number.type='number';number.min='0';
      number.max=String(max);number.step='1';number.placeholder='请输入张数';
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
    select.append(option('','请选择'));
    for(const item of options||[])select.append(option(item.value,item.label));
    select.value=value||'';
    select.addEventListener('change',()=>commit(select.value||null));
    return select;
  }
  function question(item,common=false,result,active=true){
    const card=el('section','question');
    const head=el('div','question-head');
    head.append(el('strong','',item.title));
    head.append(el('span','muted',!active?'已回答 · 可以修改':
      common?'信用情况':'与这张卡有关'));
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
      for(const choice of [...item.options,{value:'NONE',label:'以上都没有'}]){
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
        const confirm=el('button','secondary','确认以上选择');confirm.type='button';
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
        [{value:'NONE',label:'以上都没有'}]:[])];
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
      input.placeholder='请填写你知道的情况（仅保存在本机）';
      input.value=String(answers[item.id]??'');
      const button=el('button','secondary','保存答案');button.type='button';
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
      card.append(el('p','small','对应规则：'+item.rule_ids.map(ruleLabel).join('、')));
    return card;
  }
  const ISSUER_LABELS={
    AMEX:'American Express',CHASE:'Chase',CITI:'Citi',
    CAPITAL_ONE:'Capital One',BOFA:'Bank of America',US_BANK:'U.S. Bank',
    WELLS_FARGO:'Wells Fargo',BARCLAYS:'Barclays',COLUMN_NA:'Bilt / Column'
  };
  function option(value,label){
    const n=el('option','',label);
    n.value=value;return n;
  }
  function resetAnswers(){
    for(const key of Object.keys(answers))delete answers[key];

  }
  function clearReport(note='先选择一张信用卡，我们会根据这张卡生成问题'){
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
    fillSelect(issuer,'请选择银行',known.map(key=>({
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
    fillSelect(type,'请选择个人卡或商业卡',[
      {value:'PERSONAL',label:'个人卡'},
      {value:'BUSINESS',label:'商业卡'}
    ].filter(v=>available.includes(v.value)));
    type.disabled=!bank;
    fillSelect($('card-select'),'请先选择卡片类型',[]);
    $('card-select').disabled=true;
    selectedProductId='';
    $('generate').disabled=true;
    resetAnswers();clearReport(bank?'请选择卡片类型':'请选择银行');
  }
  function populateCards(){
    const issuer=$('issuer').value,type=$('customer-type').value;
    const select=$('card-select');
    const matches=cards.filter(p=>p.issuer===issuer&&p.customer_type===type)
      .sort((a,b)=>a.name.localeCompare(b.name,'en'));
    fillSelect(select,'请选择要申请的卡',matches.map(p=>({
      value:p.product_id,label:p.name
    })));
    select.disabled=!type||!matches.length;
    selectedProductId='';
    $('generate').disabled=true;
    resetAnswers();
    clearReport(matches.length?'请选择信用卡':'这里暂时没有可选的卡');
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
    const result=facade.plan({product_id:selectedProductId,
      known_facts:answers,offer_variant:$('offer-variant').value});
    const status=$('summary'),list=$('questions');
    if(!result.questionnaire){
      clearReport('无法读取选定信用卡：'+(result.status||'请重新选择'));
      return;
    }
    $('amex-offer-settings').hidden=result.identity.issuer!=='AMEX';
    const plan=result.questionnaire,info=plan.diagnostics;
    const label=result.identity.name;
    status.textContent=label+' · 适用规则 '+info.applicable_rule_ids.length+
      ' 条 · 待核实系统条件 '+(info.unresolved_system_gates.length+
      info.unresolved_target_mappings.length)+' 条 · 需补充事实 '+
      plan.questionnaire.specific.length+' 组';
    const source={
      REVIEWED_PRODUCT:'已审核 Assessment 产品',
      EXPANSION_CANDIDATE:'扩展候选资料',
      HISTORY_ONLY:'历史奖励记录',
      NB_FORMAL_CATALOG:'NB 正式版信用卡目录',
      USER_SUPPLIED_PARTIAL:'用户提供的部分信息'
    }[result.identity.source]||result.identity.source;
    $('identity-note').textContent='身份来源：'+(result.identity.formal_nb_card_id
      ?'NB 正式版信用卡目录（仅卡片身份）':source)+
      '。'+(result.offer_context
        ?'Amex 按选定 Offer 场景建模'+(result.offer_context.variant==='NLL'
          ?'，已启用 NLL 特殊变量。':'。')
        +'这里是问卷假设，并非实时核实的申请条款。'
        :result.identity.issuer==='CHASE'
          ?'Chase 按现有规则库模拟；卡片历史身份和当前申请条款尚需分别核实。'
          :'此页仅生成问卷，不据此判断开卡资格、当前条款或获批可能性。');
    // The rule planner intentionally returns only unanswered facts, but this
    // QA page keeps all previously displayed questions editable and visible.
    const activeIds=new Set(plan.questionnaire.specific.map(q=>q.id));
    list.replaceChildren(el('h2','','先了解一下你的信用情况'));
    for(const q of baseQuestionLibrary)list.append(question(q,true,result,true));
    list.append(el('h2','','关于这张卡，还想了解这些情况'));
    const currentQuestions=plan.questionnaire.editable||plan.questionnaire.specific;
    if(!currentQuestions.length)list.append(el('p','muted','目前没有其他需要回答的问题。'));
    for(const q of currentQuestions)list.append(question(q,false,result,activeIds.has(q.id)));
    const report=$('assessment-result');
    report.replaceChildren();
    if(result.evaluation){
      const d=result.evaluation;
      const issuerLabel=ISSUER_LABELS[d.issuer]||d.issuer;
      report.append(el('h2','','这张 '+issuerLabel+' 卡适不适合现在申请？'));
      const summary=el('div','assessment-summary');
      const app=el('section','assessment-panel');
      app.append(el('strong','','申请风险'));
      app.append(el('p',['PRODUCT_INELIGIBLE','APPLICATION_INELIGIBLE','WAIT'].includes(d.application.status)?'rule-delta':'',d.application.message));
      app.append(el('p','small','申请影响：'+d.application.impact+'/3 · '+({WAIT:'等待',BLOCK:'受限',RISK:'风险提示',UNKNOWN:'待确认',CLEAR:'未触发'}[d.application.action]||d.application.action)));
      app.append(el('p','small','基础信用情况：'+({
        HIGH:'优秀（最高档）',MEDIUM:'一般',HIGH_RISK:'偏高风险',
        INSUFFICIENT_DATA:'还没算出来'
      })[d.application.base_risk]+'。这不是银行的获批概率。'));
      const unfinished=d.application.unresolved_rules||[];
      if(unfinished.length){
        app.append(el('p','small',issuerLabel+' 申请规则：'+
          unfinished.filter(x=>x.status==='MISSING').length+' 项还没回答，'+
          unfinished.filter(x=>x.status==='REVIEW').length+' 项需要再确认。'));
        const detail=el('details','approval-gaps');
        detail.append(el('summary','','看看还有哪些信息没确认（'+unfinished.length+' 项）'));
        for(const row of unfinished){
          detail.append(el('p','small',ruleLabel(row.rule_id)+' · '+
            (row.status==='MISSING'?'还没回答':'需要核实')+'：'+row.reason));
        }
        app.append(detail);
      }else if(d.application.base_completed){
        app.append(el('p','small','这张卡适用的 '+issuerLabel+' 申请规则已检查完。'));
      }
      const bonus=el('section','assessment-panel');
      bonus.append(el('strong','','能不能拿到开卡奖励'));
      bonus.append(el('p',['PRODUCT_INELIGIBLE','BONUS_INELIGIBLE'].includes(d.bonus.status)?'rule-delta':'',d.bonus.message));
      bonus.append(el('p','small','奖励影响：'+d.bonus.impact+'/3 · '+({WAIT:'等待',BLOCK:'受限',RISK:'风险提示',UNKNOWN:'待确认',CLEAR:'未触发'}[d.bonus.action]||d.bonus.action)));
      if(!d.bonus.complete)bonus.append(el('p','small','还有奖励相关事实或条款需要确认。'));
      bonus.append(el('p','small','当前按以下条款估算：'+(d.offer_variant==='NLL'?'NLL（不含普通同卡终身限制）':'普通公开 Offer')));
      summary.append(app,bonus);report.append(summary);
      const itemized=el('details','rule-report');
      itemized.append(el('summary','','查看每条规则的判断（'+d.rule_results.length+' 项）'));
      for(const rule of d.rule_results){
        const desc=el('p','small',
          ruleLabel(rule.rule_id)+' · '+({TRIGGERED:rule.product_eligibility?'不符合产品申请条件':rule.hard_bonus_eligibility?'不符合开卡奖励条件':'可能受限',CLEAR:'没有触发',
            MISSING:'还没回答',REVIEW:'需要核实'})[rule.status]+' · '+rule.reason);
        itemized.append(desc);
      }
      report.append(itemized,el('p','small',d.caveat));
      if(result.marriott_matrix){
        const pending=result.marriott_matrix;
        report.append(el('p','small',(d.issuer==='CHASE'?'Marriott 申请及开卡奖励限制：':'Marriott 跨银行开卡奖励限制：')+
          ({CLEAR:'根据已填记录，这条限制不适用',TRIGGERED:'已触发持卡历史限制',
             MISSING:'还需要补充相关持卡时间',
             SKIPPED_AFTER_BONUS_BLOCK:'已经发现其他奖励限制，不再重复追问',
             NOT_APPLICABLE:'不适用'})[pending.status]+'。具体以这次申请的条款为准。'));
      }
    }
    $('scope').textContent='对应的规则编号：'+info.applicable_rule_ids.join('、');
    $('gaps').textContent='待核实的申请条款：'+
      (info.unresolved_system_gates.map(x=>x.rule_id).join('、')||'无')+
      '；卡片信息缺失：'+(info.unresolved_target_mappings.map(x=>x.rule_id).join('、')||'无');
  }
  async function start(){
    if(loading)return;
    loading=true;
    $('retry').hidden=true;
    $('summary').textContent='正在加载卡片和申请规则…';
    $('generate').disabled=true;
    try{
      const files=['bank-rules/rules.json','bank-rules/facts.json','bank-rules/products.json',
        'bank-rules/approval.json','data/card-identity-index.json','data/amex-formal-product-identities.json'];
      const [rulebook,factbook,products,approval,identityIndex,formalAmex]=
        await Promise.all(files.map(async name=>{
          const response=await fetch(name,{cache:'no-cache'});
          if(!response.ok)throw Error('数据文件加载失败：'+name+' (HTTP '+response.status+')');
          return response.json();
        }));
      const runtime=window.NextBonusBankRulesRuntime.createRuntime({rulebook,factbook,products,approval});
      baseQuestionLibrary=runtime.commonQuestions;
      Object.assign(readableRuleNames,runtime.ruleLabels);
      facade=runtime.createFacade(window.NextBonusCardIdentityV1.createLookup(identityIndex));
      const formalNames=new Map((formalAmex.products||[]).map(x=>[x.assessment_product_id,x.display_name]));
      cards=facade.listCards().filter(p=>p.issuer&&p.customer_type)
        .map(p=>({...p,name:formalNames.get(p.product_id)||p.name}));
      $('version').textContent='规则库 '+runtime.version+' · '+facade.getVersion().rules_indexed+' 条 · '+cards.length+' 张卡';
      populateBanks();
      // Start at the most mature coverage area, but never silently choose
      // a specific card or execute an unrelated old evaluation.
      $('issuer').value='AMEX';
      populateTypes();
      $('customer-type').value='PERSONAL';
      populateCards();
    }catch(error){
      facade=null;cards=[];selectedProductId='';
      clearReport('初始化失败：'+(error?.message||'未知错误'));
      $('retry').hidden=false;
      $('issuer').disabled=true;$('customer-type').disabled=true;
      $('card-select').disabled=true;
      $('version').textContent='未完成加载；不会显示旧卡片或旧评估结果';
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