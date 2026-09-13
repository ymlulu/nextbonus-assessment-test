(function(){'use strict';
function clean(x){return String(x==null?'':x).trim()}
function isUnknown(x,tokens){const s=clean(x);return !s||tokens.some(t=>s.includes(t))}
function readSpec(answers,source){return (answers&&answers.specific&&answers.specific[source]!==undefined)?answers.specific[source]:null}
function evalMapping(def,answers,tokens){const value=readSpec(answers,def.source);
  if(def.type==='boolean_equals'){if(isUnknown(value,tokens))return null;return clean(value)===def.true_when}
  if(def.type==='boolean_not_prefix'){if(isUnknown(value,tokens))return null;return !clean(value).startsWith(def.false_prefix)}
  if(def.type==='band'){if(isUnknown(value,tokens))return null;const s=clean(value);for(const pair of def.map||[]){if(s.includes(pair[0]))return pair[1]}return 'OTHER'}
  if(def.type==='number_or_zero'){const raw=readSpec(answers,def.source);if(raw!==null&&raw!==undefined&&clean(raw)!==''){const n=Number(raw);return Number.isFinite(n)?n:null}const fb=readSpec(answers,def.fallback_source);if(isUnknown(fb,tokens))return null;return clean(fb)===def.zero_when?0:null}
  if(def.type==='multi_history'){const arr=Array.isArray(value)?value:[];if(arr.some(x=>isUnknown(x,tokens)))return null;return arr.map(clean).filter(v=>v&&v!==def.none_value)}
  if(def.type==='enum_contains'){if(isUnknown(value,tokens))return null;const s=clean(value);for(const pair of def.map||[]){if(s.includes(pair[0]))return pair[1]}return def.default===undefined?null:def.default}
  throw Error('Unsupported fact mapping type: '+def.type)
}
function normalize(cardKey,answers,config){const tokens=config.unknown_tokens||[];const card=config.cards&&config.cards[cardKey];if(!card)throw Error('Missing fact mapping for '+cardKey);const out={};for(const[name,def]of Object.entries(card.facts||{}))out[name]=evalMapping(def,answers,tokens);return out}
window.FactNormalizerV3={normalize,version:'fact-normalizer-3'};
})();
