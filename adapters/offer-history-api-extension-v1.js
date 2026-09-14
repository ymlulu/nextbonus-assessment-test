(function(root){
  'use strict';
  if(!root.AssessmentApiV1)return;
  const originalEvaluate=root.AssessmentApiV1.evaluate;
  const ready=fetch('data/offer-history.json',{cache:'no-store'})
    .then(response=>{if(!response.ok)throw Error('Failed to load offer history');return response.json();})
    .catch(()=>null);
  root.AssessmentApiV1.evaluate=async function(args){
    const offerHistory=await ready;
    if(offerHistory&&args&&args.runtime&&!args.runtime.offerHistory)args.runtime.offerHistory=offerHistory;
    return originalEvaluate(args);
  };
})(window);
