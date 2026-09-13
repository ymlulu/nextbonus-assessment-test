(function(){'use strict';
function clean(x){return String(x==null?'':x).trim()}
function isUnknown(x,values){const s=clean(x);return !s||values.includes(s)}
function readSpec(answers,source){return(answers&&answers.specific&&answers.specific[source]!==undefined)?answers.specific[source]:null}
function evalMapping(def,answers,unknownValues){const value=readSpec(answers,def.source);
  if(def.type==='boolean_equals'){if(isUnknown(value,unknownValues))return null;return value===def.true_when}
  if(def.type==='enum_map'){if(isUnknown(value,unknownValues))return null;return Object.prototype.hasOwnProperty.call(def.map||{},value)?def.map[value]:null}
  if(def.type==='number_or_zero'){const raw=readSpec(answers,def.source);if(raw!==null&&raw!==undefined&&clean(raw)!==''){const n=Number(raw);return Number.isFinite(n)?n:null}const fb=readSpec(answers,def.fallback_source);if(isUnknown(fb,unknownValues))return null;return fb===def.zero_when?0:null}
  if(def.type==='multi_history'){if(!Array.isArray(value)||value.length===0)return null;if(value.some(x=>isUnknown(x,unknownValues)))return null;return value.filter(v=>v&&v!==def.none_value)}
  throw Error('Unsupported fact mapping type: '+def.type)
}
function normalize(cardKey,answers,config){const unknownValues=config.unknown_values||['UNKNOWN'];const card=config.cards&&config.cards[cardKey];if(!card)throw Error('Missing fact mapping for '+cardKey);const out={};for(const[name,def]of Object.entries(card.facts||{}))out[name]=evalMapping(def,answers,unknownValues);return out}
window.FactNormalizerV3={normalize,version:'fact-normalizer-3.2'};
})();
