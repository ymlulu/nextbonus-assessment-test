/* Local v2 browser bridge; messages stay inside the browser. */
(function(){
'use strict';
const CHANNEL='nextbonus-assessment-v2';
const METHODS=new Set(['getVersion','listCards','plan','evaluate','getOfferHistory','getOfferTiming']);
function allowed(origin){
 try{const u=new URL(origin);return u.origin===window.location.origin||
  ['https://nextbonus-preview.pages.dev','https://ymlulu.github.io'].includes(u.origin)||
  (['localhost','127.0.0.1'].includes(u.hostname)&&['http:','https:'].includes(u.protocol));}catch{return false;}
}
async function invoke(method,params){
 const {client}=await NextBonusAssessmentLoaderV2.load();
 if(method==='getVersion'||method==='listCards')return client[method]();
 if(method==='getOfferHistory')return client.getOfferHistory({product_id:params.product_id,evaluation_date:params.evaluation_date,offerHistory:await NextBonusAssessmentLoaderV2.history()});
 if(method==='getOfferTiming')return client.getOfferTiming({product_id:params.product_id,offerTiming:await NextBonusAssessmentLoaderV2.timing()});
 return client[method](params.request||params);
}
window.addEventListener('message',async event=>{
 const m=event.data;
 if(!m||m.channel!==CHANNEL||!m.request_id||!METHODS.has(m.method)||!allowed(event.origin)||!event.source)return;
 try{const result=await invoke(m.method,m.params||{});event.source.postMessage({channel:CHANNEL,request_id:m.request_id,ok:true,result},event.origin);}
 catch{event.source.postMessage({channel:CHANNEL,request_id:m.request_id,ok:false,error:{code:'ASSESSMENT_UNAVAILABLE',message:'无法完成此评估请求'}},event.origin);}
});
})();
