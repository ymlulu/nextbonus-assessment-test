const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={window:{},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'engines/fact-normalizer.js'),'utf8'),ctx);Object.assign(ctx,ctx.window);
const config=JSON.parse(fs.readFileSync(path.join(root,'data/fact-mapping.json'),'utf8'));
function norm(card,specific){return ctx.FactNormalizerV3.normalize(card,{specific},config).amex_history}
for(const card of ['amex_gold','amex_platinum']){
  assert.equal(norm(card,{}),null,'unanswered Q6 must be UNKNOWN');
  assert.equal(norm(card,{Q6:[]}),null,'empty Q6 must be UNKNOWN');
  assert.equal(norm(card,{Q6:['UNKNOWN']}),null,'explicit unsure must be UNKNOWN');
  assert.deepEqual(Array.from(norm(card,{Q6:['NONE']})),[],'explicit none must be clear empty history');
  assert.deepEqual(Array.from(norm(card,{Q6:['AMEX Platinum']})),['AMEX Platinum'],'selected history must be preserved');
}
console.log(JSON.stringify({cards:2,cases:10,status:'PASS'}));
