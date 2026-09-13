// Pass an HTML snapshot taken from the deployed repository before this change.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const before=fs.readFileSync(process.argv[2],'utf8');
const after=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=s=>[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).slice(0,2);
assert.deepEqual(scripts(after),scripts(before),'Config and business engine must be byte-identical');
function engine(s){const ctx={window:{}};vm.createContext(ctx);for(const code of scripts(s))vm.runInContext(code,ctx);return ctx.window}
const a=engine(before),b=engine(after);let cases=0;
for(const card of Object.keys(a.NB_CONFIG.cards))for(const age of ['2年以上','不到 6 个月','不确定',null])for(const score of ['740+','670 以下','不知道',null])for(const specific of [{},{Q5A:'有',Q5B:'10 张或以上',Q6:['AMEX Platinum']},{Q5A:'5 张或以上',Q6C:'是',Q6A:'有',Q6B:'有',Q6B_FOLLOWUP:'是'},{Q5A:'不确定',Q5B:'不确定',Q6:['不确定'],Q6A:'不确定'}]){
 const answers={a1:age,a2:score,a3:'0 张',a4:'0 张',specific,q7:[],q8:[],q7Answered:false,q8Answered:false};
 assert.equal(JSON.stringify(a.NBEngine.evaluate(card,answers)),JSON.stringify(b.NBEngine.evaluate(card,answers)));cases++;
}
console.log(JSON.stringify({businessScriptsIdentical:true,identicalOutputCases:cases}));
