/* Shared static-data loader. Only GETs fixed public assets; never sends assessment inputs. */
(function(root){
'use strict';
let clientPromise=null,historyPromise=null,timingPromise=null;
const json=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw Error('数据文件加载失败：'+path+' (HTTP '+r.status+')');return r.json();};
function load(){
 if(!clientPromise)clientPromise=Promise.all(['bank-rules/rules.json','bank-rules/facts.json','bank-rules/products.json','bank-rules/approval.json',
  'data/card-identity-index.json','data/amex-formal-product-identities.json'].map(json)).then(([rulebook,factbook,products,approval,identityIndex,formalAmex])=>({
  client:root.NextBonusAssessmentV2.createClient({rulebook,factbook,products,approval,identityIndex}),formalAmex
 })).catch(e=>{clientPromise=null;throw e;});
 return clientPromise;
}
function history(){if(!historyPromise)historyPromise=json('data/offer-history.json').catch(e=>{historyPromise=null;throw e;});return historyPromise;}
function timing(){if(!timingPromise)timingPromise=json('data/offer-timing.json').catch(e=>{timingPromise=null;throw e;});return timingPromise;}
root.NextBonusAssessmentLoaderV2=Object.freeze({load,history,timing});
})(typeof globalThis!=='undefined'?globalThis:this);
