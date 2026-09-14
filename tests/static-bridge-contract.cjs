const fs=require('fs'),assert=require('assert/strict');
const html=fs.readFileSync('bridge.html','utf8');
const bridge=fs.readFileSync('adapters/static-bridge-v1.js','utf8');

for(const path of [
  'engines/bank-rule-engine.js','engines/timing-engine.js','engines/fact-normalizer.js','engines/approval-engine.js',
  'engines/long-term-engine.js','engines/orchestrator-engine.js','engines/report-renderer.js','engines/assessment-core-v1.js',
  'adapters/assessment-api-v1.js','adapters/static-bridge-v1.js'
]) assert.ok(html.includes(`src="${path}"`),`bridge.html must load ${path}`);

for(const method of ['getVersion','getProductAssessment','evaluate'])assert.ok(bridge.includes(`'${method}'`),`bridge missing ${method}`);
for(const call of ['AssessmentApiV1.getVersion','AssessmentApiV1.getProductAssessment','AssessmentApiV1.evaluate'])assert.ok(bridge.includes(call),`bridge must delegate to ${call}`);
assert.ok(bridge.includes("https://nextbonus-preview.pages.dev"),'preview origin must be allowed');
assert.ok(bridge.includes("https://ymlulu.github.io"),'GitHub Pages origin must be allowed');
assert.ok(bridge.includes("event.source.postMessage"),'bridge must reply to request source');
assert.ok(bridge.includes("event.origin"),'bridge reply must bind to request origin');
assert.ok(!bridge.includes('NBUI'),'bridge must not depend on QA UI');
assert.ok(!bridge.includes('localStorage'),'bridge must remain stateless');
assert.ok(!bridge.includes('innerHTML'),'bridge must not implement business UI');
console.log(JSON.stringify({channel:'nextbonus-assessment-v1',methods:3,transport:'static-postMessage',status:'PASS'}));
