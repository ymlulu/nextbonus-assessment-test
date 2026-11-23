(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const answers=Object.create(null);
  let planner=null;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function question(item,common=false){
    const card=el('section','question');
    const head=el('div','question-head');
    head.append(el('strong','',item.title));
    head.append(el('span','muted',common?'基础评分':'规则自动匹配'));
    card.append(head);
    if(common&&item.options?.length){
      const select=el('select');
      select.append(el('option','','请选择（可跳过）'));
      for(const option of item.options){
        const node=el('option','',option.label);node.value=option.value;
        if(answers[item.id]===option.value)node.selected=true;
        select.append(node);
      }
      select.addEventListener('change',()=>{
        if(select.value)answers[item.id]=select.value;
        else delete answers[item.id];
        render();
      });
      card.append(select);
    }else{
      const input=el('input');input.type='text';input.placeholder=
        item.id==='F01_RECENT_NEW_ACCOUNTS'?'可填写数量，例如 5':'试填答案（仅页面内存）';
      input.value=typeof answers[item.id]==='string'?answers[item.id]:'';
      const button=el('button','secondary','填好并更新问题');
      button.type='button';
      button.addEventListener('click',()=>{
        const value=input.value.trim();
        if(value)answers[item.id]=item.id==='F01_RECENT_NEW_ACCOUNTS'&&/^\d+$/.test(value)?Number(value):value;
        else delete answers[item.id];
        render();
      });
      const row=el('div','input-row');row.append(input,button);
      card.append(row);
      const refs=el('p','small','依据规则：'+item.rule_ids.join('、'));
      card.append(refs);
    }
    return card;
  }
  function render(){
    if(!planner)return;
    const id=$('product').value;
    const plan=planner.getQuestionnaire({product_id:id,known_facts:answers});
    const info=plan.diagnostics;
    $('summary').textContent=
      '适用的可执行规则 '+info.applicable_rule_ids.length+
      ' 条 · 待核实 Offer 条款 '+info.unresolved_system_gates.length+
      ' 条 · 需补充事实 '+plan.questionnaire.specific.length+' 组';
    const list=$('questions');list.replaceChildren();
    const header=el('h2','','基础评分问题');list.append(header);
    for(const q of plan.questionnaire.common)list.append(question(q,true));
    if(!plan.questionnaire.common.length)list.append(el('p','muted','基础评分问题已在当前页面填写。'));
    list.append(el('h2','','按规则生成的问题'));
    if(!plan.questionnaire.specific.length)list.append(el('p','muted','当前没有需要补充的规则事实。'));
    for(const q of plan.questionnaire.specific)list.append(question(q));
    $('scope').textContent='匹配的 Rule IDs：'+info.applicable_rule_ids.join('、');
    $('gaps').textContent='尚不能安全推断的系统条件：'+
      (info.unresolved_system_gates.map(x=>x.rule_id).join('、')||'无');
  }
  async function start(){
    const names=['dynamic-questionnaire-rule-index.json','products.json',
      'questions.json','frozen-offer-facts.json'];
    const [ruleIndex,products,questions,frozenOfferFacts]=await Promise.all(
      names.map(async n=>{
        const response=await fetch('data/'+n,{cache:'no-cache'});
        if(!response.ok)throw Error('缺少独立项目数据：'+n);
        return response.json();
      }));
    planner=window.NextBonusQuestionnairePlannerV1.makePlanner({
      ruleIndex,products,baseQuestions:questions.common,frozenOfferFacts
    });
    for(const x of planner.listProducts()){
      const option=el('option','',x.name);option.value=x.product_id;$('product').append(option);
    }
    $('product').addEventListener('change',()=>{
      for(const key of Object.keys(answers))delete answers[key];
      render();
    });
    $('reset').addEventListener('click',()=>{
      for(const key of Object.keys(answers))delete answers[key];
      render();
    });
    $('version').textContent='版本 '+planner.getVersion().release_id+' · 129 条规则索引';
    render();
  }
  start().catch(e=>{$('summary').textContent=e.message;});
})();