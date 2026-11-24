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
  function optionsForQuestion(item){
    const select=el('select');
    const empty=el('option','','请选择（可跳过）');empty.value='';
    select.append(empty);
    for(const option of item.options||[]){
      const node=el('option','',option.label);node.value=option.value;
      if(answers[item.id]===option.value)node.selected=true;
      select.append(node);
    }
    select.addEventListener('change',()=>{
      if(select.value)answers[item.id]=select.value;
      else delete answers[item.id];
      render();
    });
    return select;
  }
  function question(item,common=false){
    const card=el('section','question');
    const head=el('div','question-head');
    head.append(el('strong','',item.title));
    head.append(el('span','muted',common?'基础评分':'规则自动匹配'));
    card.append(head);
    if(item.description)card.append(el('p','small',item.description));
    if(item.type==='structured_marriott'&&Array.isArray(item.fields)){
      const stored=answers.F07_MARRIOTT_DETAILS||{};
      const prior=stored[item.prior_id]||{};
      const fields=[];
      for(const def of item.fields){
        const label=el('label','structured-field',def.label);
        const control=el('select');
        const empty=el('option','','请选择');empty.value='';control.append(empty);
        for(const option of def.options||[]){
          const node=el('option','',option.label);node.value=option.value;
          if(prior[def.id]===option.value)node.selected=true;
          control.append(node);
        }
        label.append(control);card.append(label);
        fields.push({def,control});
      }
      const button=el('button','secondary','保存并继续判断');
      button.type='button';
      button.addEventListener('click',()=>{
        const values={...prior};
        for(const {def,control} of fields){
          if(control.value)values[def.id]=control.value;
        }
        answers.F07_MARRIOTT_DETAILS={
          ...(answers.F07_MARRIOTT_DETAILS||{}),[item.prior_id]:values
        };
        render();
      });
      card.append(button);
    }else if(item.type==='structured'&&Array.isArray(item.fields)){
      const entry=answers[item.id]&&typeof answers[item.id]==='object'?answers[item.id]:{};
      const controls=[];
      for(const field of item.fields){
        const label=el('label','structured-field',field.label);
        let control;
        if(field.type==='number'){
          control=el('input');control.type='number';control.min=String(field.min??0);
          control.max=String(field.max??30);control.step='1';
          control.value=entry[field.id]===undefined?'':String(entry[field.id]);
        }else{
          control=el('select');
          const empty=el('option','','请选择');empty.value='';control.append(empty);
          for(const choice of field.options||[]){
            const opt=el('option','',choice.label);opt.value=choice.value;
            if(entry[field.id]===choice.value)opt.selected=true;
            control.append(opt);
          }
        }
        label.append(control);card.append(label);
        controls.push({field,control});
      }
      const button=el('button','secondary','保存并更新问卷');
      button.type='button';
      button.addEventListener('click',()=>{
        const data={};
        for(const {field,control} of controls){
          const value=control.value;
          if(!value)continue;
          if(field.type==='number'){
            if(!/^\d+$/.test(value)||Number(value)>field.max)return;
            data[field.id]=Number(value);
          }else data[field.id]=value;
        }
        if(Object.keys(data).length)answers[item.id]=data;
        else delete answers[item.id];
        render();
      });
      card.append(button);
    }else if((common||item.type==='single')&&item.options?.length){
      card.append(optionsForQuestion(item));
    }else if(item.type==='multi'&&item.options?.length){
      const options=el('div','choice-list');
      const boxes=[];
      for(const option of item.options){
        const label=el('label','check-option');
        const box=el('input');box.type='checkbox';box.value=option.value;
        const existing=Array.isArray(answers[item.id])?answers[item.id]:[];
        box.checked=existing.includes(option.value);
        label.append(box,document.createTextNode(option.label));
        options.append(label);boxes.push(box);
      }
      if(item.allow_none){
        const label=el('label','check-option');
        const box=el('input');box.type='checkbox';box.value='NONE';
        label.append(box,document.createTextNode('以上都没有'));
        options.append(label);boxes.push(box);
        box.addEventListener('change',()=>{
          if(box.checked)boxes.filter(x=>x!==box).forEach(x=>{x.checked=false;});
        });
        for(const other of boxes.filter(x=>x!==box)){
          other.addEventListener('change',()=>{if(other.checked)box.checked=false;});
        }
      }
      const button=el('button','secondary','确认选择并继续');
      button.type='button';
      button.addEventListener('click',()=>{
        const selected=boxes.filter(x=>x.checked).map(x=>x.value);
        if(selected.length)answers[item.id]=selected;
        else delete answers[item.id];
        render();
      });
      card.append(options,button);
    }else{
      const input=el('input');
      input.type=item.type==='number'?'number':'text';
      if(item.type==='number'){input.min=String(item.min??0);input.max=String(item.max??99);}
      input.placeholder=item.id==='F01_RECENT_NEW_ACCOUNTS'
        ?'可填写数量，例如 5':item.type==='number'?'请输入数量':'试填答案（仅页面内存）';
      input.value=String(answers[item.id]??'');
      const button=el('button','secondary','填好并更新问题');
      button.type='button';
      button.addEventListener('click',()=>{
        const value=input.value.trim();
        if(item.type==='number'&&value&&!/^\d+$/.test(value))return;
        if(value)answers[item.id]=(item.type==='number'||
          item.id==='F01_RECENT_NEW_ACCOUNTS'&&/^\d+$/.test(value))?Number(value):value;
        else delete answers[item.id];
        render();
      });
      const row=el('div','input-row');row.append(input,button);card.append(row);
    }
    if(item.rule_ids?.length)card.append(el('p','small','依据规则：'+item.rule_ids.join('、')));
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
  function clearReport(note='请选择信用卡以生成申请问卷'){
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
    fillSelect(select,'请选择具体信用卡',matches.map(p=>({
      value:p.product_id,label:p.name
    })));
    select.disabled=!type||!matches.length;
    selectedProductId='';
    $('generate').disabled=true;
    resetAnswers();
    clearReport(matches.length?'请选择信用卡':'该类别暂无信用卡');
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
        ?'Amex 按普通 Offer 建模'+(result.offer_context.variant==='NLL'
          ?'，已启用 NLL 特殊变量。':'。')
        +'这里是问卷假设，并非实时核实的申请条款。'
        :'此页仅生成问卷，不据此判断开卡资格、当前条款或获批可能性。');
    list.replaceChildren(el('h2','','基础评分问题'));
    for(const q of plan.questionnaire.common)list.append(question(q,true));
    if(!plan.questionnaire.common.length)
      list.append(el('p','muted','基础评分问题已经在本页回答。'));
    list.append(el('h2','','按规则生成的问题'));
    if(!plan.questionnaire.specific.length)
      list.append(el('p','muted','当前没有需要补充的规则事实。'));
    for(const q of plan.questionnaire.specific)list.append(question(q));
    if(plan.questionnaire.pending_terms?.length){
      const pending=el('details','pending-rules');
      const label=el('summary','','需要先核实当前 Offer 条款（'+
        plan.questionnaire.pending_terms.length+' 条，不计入问卷）');
      pending.append(label,el('p','small','以下限制可能与目标卡有关，但当前申请条款没有确认。系统不会擅自认定这些限制存在，也不会以此判断奖励资格。'));
      for(const rule of plan.questionnaire.pending_terms){
        const p=el('p','small',rule.rule_id+' · '+rule.title+
          (rule.history_scope.length?' · 可能关联：'+rule.history_scope.join('、'):''));
        pending.append(p);
      }
      list.append(pending);
    }

    const report=$('assessment-result');
    report.replaceChildren();
    if(result.evaluation){
      const d=result.evaluation;
      report.append(el('h2','','Amex 本机评估结果'));
      const summary=el('div','assessment-summary');
      const app=el('section','assessment-panel');
      app.append(el('strong','','申请风险'));
      app.append(el('p','',d.application.message));
      app.append(el('p','small','通用信用矩阵：'+({
        HIGH:'相对较好',MEDIUM:'一般',HIGH_RISK:'偏高风险',
        INSUFFICIENT_DATA:'资料不足'
      })[d.application.base_risk]+'。不代表银行审批概率。'));
      const bonus=el('section','assessment-panel');
      bonus.append(el('strong','','开卡奖励资格'));
      bonus.append(el('p','',d.bonus.message));
      bonus.append(el('p','small','Offer 假设：'+(d.offer_variant==='NLL'?'NLL 特殊 Offer':'普通公开 Offer')));
      summary.append(app,bonus);report.append(summary);
      const itemized=el('details','rule-report');
      itemized.append(el('summary','','逐条规则解释（'+d.rule_results.length+' 项）'));
      for(const rule of d.rule_results){
        const desc=el('p','small',
          rule.rule_id+' · '+({TRIGGERED:'触发风险/限制',CLEAR:'未发现触发',
            MISSING:'需要补充',REVIEW:'待确认'})[rule.status]+' · '+rule.reason);
        itemized.append(desc);
      }
      report.append(itemized,el('p','small',d.caveat));
      if(result.marriott_matrix){
        const pending=result.marriott_matrix;
        report.append(el('p','small','Marriott 跨银行规则：'+
          ({CLEAR:'已根据现有历史排除限制',TRIGGERED:'已有明确触发条件',
             MISSING:'仍缺少会影响判断的历史事实',
             SKIPPED_AFTER_BONUS_BLOCK:'其他奖励限制已触发，跳过无关追问',
             NOT_APPLICABLE:'不适用'})[pending.status]+'。仅按本次所选 Offer 模型判断。'));
      }
    }
    $('scope').textContent='匹配规则：'+info.applicable_rule_ids.join('、');
    $('gaps').textContent='待核实系统条件：'+
      (info.unresolved_system_gates.map(x=>x.rule_id).join('、')||'无')+
      '；目标属性不完整：'+(info.unresolved_target_mappings.map(x=>x.rule_id).join('、')||'无');
  }
  async function start(){
    if(loading)return;
    loading=true;
    $('retry').hidden=true;
    $('summary').textContent='正在读取独立卡片目录和规则…';
    $('generate').disabled=true;
    try{
      const files=['dynamic-questionnaire-rule-index.json','products.json',
        'questions.json','frozen-offer-facts.json','card-identity-index.json',
        'amex-questionnaire-policy.json','approval-config.json',
        'marriott-eligibility-matrix.json','amex-formal-product-identities.json'];
      const [ruleIndex,products,questions,frozenOfferFacts,identityIndex,
        amexPolicy,approvalConfig,marriottMatrixConfig,formalAmex]=
        await Promise.all(files.map(async name=>{
          const response=await fetch('data/'+name,{cache:'no-cache'});
          if(!response.ok)throw Error('数据文件加载失败：'+name+' (HTTP '+response.status+')');
          return response.json();
        }));
      if(!window.NextBonusQuestionnairePlannerV1||
         !window.NextBonusCardIdentityV1||!window.NextBonusAmexQuestionnaireV1||
         !window.NextBonusAmexOfferContextV1||!window.NextBonusAmexDecisionV1||
         !window.NextBonusMarriottMatrixV1||!window.NextBonusQuestionnaireFacadeV1)
        throw Error('评估引擎文件未完全加载，请刷新页面');
      const planner=window.NextBonusQuestionnairePlannerV1.makePlanner({
        ruleIndex,products,baseQuestions:questions.common,frozenOfferFacts
      });
      const lookup=window.NextBonusCardIdentityV1.createLookup(identityIndex);
      const amexEnricher=window.NextBonusAmexQuestionnaireV1.createEnricher({policy:amexPolicy});
      facade=window.NextBonusQuestionnaireFacadeV1.createFacade({
        planner,lookup,amexEnricher,ruleIndex,
        targetState:window.NextBonusQuestionnairePlannerV1.targetState,
        amexOfferContext:window.NextBonusAmexOfferContextV1,
        amexDecision:window.NextBonusAmexDecisionV1,amexPolicy,approvalConfig,
        marriottMatrix:window.NextBonusMarriottMatrixV1.createMatrix(marriottMatrixConfig)
      });
      const formalNames=new Map((formalAmex.products||[])
        .map(x=>[x.assessment_product_id,x.display_name]));
      cards=facade.listCards().filter(p=>p.issuer&&p.customer_type)
        .map(p=>({...p,name:formalNames.get(p.product_id)||p.name}));
      $('version').textContent='独立目录 '+facade.getVersion().source_count+
        ' 张卡 · 已确认发行方 '+cards.length+' 张 · 规则索引 '+
        facade.getVersion().rules_indexed+' 条';
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