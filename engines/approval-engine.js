(function(){'use strict';
const AGE={NO_US_CARD:'None',LT_6M:'<6m',M6_11:'6–11m',Y1_2:'1–2y',Y2_PLUS:'2y+',UNKNOWN:'Unknown'};
const SCORE={SCORE_740_PLUS:'740+',SCORE_700_739:'700–739',SCORE_670_699:'670–699',SCORE_LT_670:'<670',UNKNOWN:'Unknown'};
const SEV={N0:0,N1:0,N2_3:1,N4_5:2,N6_PLUS:3};
function ageBand(x){return AGE[x]||'Unknown'}
function scoreBand(x){return SCORE[x]||'Unknown'}
function sev(x){return Object.prototype.hasOwnProperty.call(SEV,x)?SEV[x]:null}
function activity(a3,a4){const x=sev(a3),y=sev(a4);if(x==null||y==null)return'UNKNOWN';return['LOW','MEDIUM','HIGH','VERY_HIGH'][Math.max(x,y)]}
function downBase(r,n){if(r==='INSUFFICIENT_DATA')return r;const o=['HIGH','MEDIUM','HIGH_RISK'];const i=o.indexOf(r);return i<0?r:o[Math.min(2,i+n)]}
function pred(p,f){if(!p||p.op==='ALWAYS')return true;const v=f[p.fact];switch(p.op){case'EQ':return v===p.value;case'IN':return p.values.includes(v);case'AND':return(p.args||[]).every(x=>pred(x,f));case'OR':return(p.args||[]).some(x=>pred(x,f));case'NOT':return!pred(p.arg,f);default:throw Error('Unsupported approval predicate: '+p.op)}}
function applyEffect(base,e){if(e.op==='CAP_AT')return e.value;if(e.op==='DOWNGRADE')return downBase(base,Number(e.steps||0));throw Error('Unsupported approval effect: '+e.op)}
function evaluate({cardKey,issuerCode,answers,config}){const ab=ageBand(answers.a1),sb=scoreBand(answers.a2),a3s=sev(answers.a3),a4s=sev(answers.a4),sig=activity(answers.a3,answers.a4);let base=(config.base_matrix[ab]||config.base_matrix.Unknown)[sb]||'INSUFFICIENT_DATA';const sens=config.issuer_sensitivity[issuerCode]||'MEDIUM';const ga=(config.activity_adjustment[sig]||{})[sens]||0;if(sig==='UNKNOWN'&&base!=='HIGH_RISK')base='INSUFFICIENT_DATA';else base=downBase(base,ga);const rc=[],ageCode=config.reason_code_maps.age[ab],scoreCode=config.reason_code_maps.score[sb];if(ageCode)rc.push(ageCode);if(scoreCode)rc.push(scoreCode);if(sig!=='UNKNOWN')rc.push('ACTIVITY_'+sig);const facts={credit_age_band:ab,credit_score_band:sb,approved_cards_12m_severity:a3s,applications_6m_severity:a4s,activity_signal:sig};for(const ov of(config.product_overlays||{})[cardKey]||[]){if(pred(ov.when,facts)){base=applyEffect(base,ov.effect);rc.push(ov.reason_code)}}return{baseApproval:base,activitySignal:sig,genericAdjustment:ga,reasonCodes:[...new Set(rc)]}}
window.ApprovalEngineV2={evaluate,ageBand,scoreBand,activity,pred,version:'approval-engine-2.1'};
})();
