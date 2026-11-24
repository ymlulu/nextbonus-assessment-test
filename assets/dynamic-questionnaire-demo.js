(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const answers=Object.create(null);
  let facade=null,lastInput='',confirmedId=null;
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
    if((common||item.type==='single')&&item.options?.length){
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
  function showSuggestions(info){
    const choices=[
      ...(info.identity?.candidates||[]),
      ...(info.identity?.suggestions||[])
    ];
    const unique=[...new Map(choices.map(x=>[x.product_id,x])).values()];
    const selector=$('candidate');
    selector.replaceChildren();
    const empty=el('option','','请选择匹配的产品，或补充银行信息');
    empty.value='';selector.append(empty);
    for(const item of unique){
      const option=el('option','',item.name+' · '+(item.issuer||'发行方未确认'));
      option.value=item.product_id;selector.append(option);
    }
    $('candidate-controls').hidden=!unique.length;
  }
  function render(){
    if(!facade||!lastInput)return;
    const issuer=$('issuer').value||undefined;
    const type=$('customer-type').value||undefined;
    const result=facade.plan({input:lastInput,issuer,customer_type:type,
      known_facts:answers,confirm_product_id:confirmedId||undefined,
      offer_variant:$('offer-variant').value});
    const status=$('summary'),list=$('questions');
    if(!result.questionnaire){
      status.textContent=({
        NEEDS_CONFIRMATION:'找到可能匹配的信用卡，请确认具体产品',
        AMBIGUOUS:'名称存在多个匹配，请选择具体产品',
        NOT_FOUND:'暂未找到可信的产品身份；可补充发行银行和个人/商业类型预览通用问卷',
        INVALID_INPUT:'输入不是有效的信用卡名称或网址',
        INVALID_ISSUER:'银行代码无效',
        ISSUER_CONFLICT:'所选银行与已确认的产品冲突',
        CUSTOMER_TYPE_CONFLICT:'个人/商业卡类型冲突'
      })[result.status]||result.note||'请补充产品身份';
      list.replaceChildren();
      $('scope').textContent='';
      $('gaps').textContent='';
      showSuggestions(result);
      return;
    }
    $('candidate-controls').hidden=true;
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
    $('scope').textContent='匹配规则：'+info.applicable_rule_ids.join('、');
    $('gaps').textContent='待核实系统条件：'+
      (info.unresolved_system_gates.map(x=>x.rule_id).join('、')||'无')+
      '；目标属性不完整：'+(info.unresolved_target_mappings.map(x=>x.rule_id).join('、')||'无');
  }
  async function start(){
    const files=['dynamic-questionnaire-rule-index.json','products.json',
      'questions.json','frozen-offer-facts.json','card-identity-index.json',
      'amex-questionnaire-policy.json'];
    const [ruleIndex,products,questions,frozenOfferFacts,identityIndex,amexPolicy]=
      await Promise.all(files.map(async name=>{
        const response=await fetch('data/'+name,{cache:'no-cache'});
        if(!response.ok)throw Error('无法读取 Assessment 独立数据：'+name);
        return response.json();
      }));
    const planner=window.NextBonusQuestionnairePlannerV1.makePlanner({
      ruleIndex,products,baseQuestions:questions.common,frozenOfferFacts
    });
    const lookup=window.NextBonusCardIdentityV1.createLookup(identityIndex);
    const amexEnricher=window.NextBonusAmexQuestionnaireV1.createEnricher({policy:amexPolicy});
    facade=window.NextBonusQuestionnaireFacadeV1.createFacade({
      planner,lookup,amexEnricher,ruleIndex,
      targetState:window.NextBonusQuestionnairePlannerV1.targetState,
      amexOfferContext:window.NextBonusAmexOfferContextV1
    });
    $('version').textContent='独立目录 '+facade.getVersion().source_count+
      ' 张卡 · 规则索引 '+facade.getVersion().rules_indexed+' 条';
    $('generate').addEventListener('click',()=>{
      lastInput=$('card-query').value.trim();
      confirmedId=null;
      for(const key of Object.keys(answers))delete answers[key];
      render();
    });
    $('card-query').addEventListener('keydown',e=>{
      if(e.key==='Enter'){$('generate').click();}
    });
    $('confirm').addEventListener('click',()=>{
      confirmedId=$('candidate').value||null;
      if(confirmedId)render();
    });
    for(const id of ['issuer','customer-type'])$(id).addEventListener('change',()=>{
      confirmedId=null;if(lastInput)render();
    });
    $('reset').addEventListener('click',()=>{
      for(const key of Object.keys(answers))delete answers[key];
      if(lastInput)render();
    });
    $('offer-variant').addEventListener('change',()=>{
      for(const key of Object.keys(answers))delete answers[key];
      if(lastInput)render();
    });
    $('card-query').value='American Express Blue Cash Preferred Card';
    $('generate').click();
  }
  start().catch(error=>{$('summary').textContent=error.message;});
})();