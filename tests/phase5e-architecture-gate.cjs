const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const products=J('data/products.json'),rules=J('data/bank-rules.json');
const genericFiles=['engines/fact-normalizer.js','engines/bank-rule-engine.js','engines/approval-engine.js','engines/long-term-engine.js','engines/orchestrator-engine.js','engines/report-renderer.js','engines/assessment-runtime-engine-v3.js','scripts/export_assessment_runtime_v2.py','scripts/validate_runtime_data_v2.py'];
for(const file of genericFiles){const code=fs.readFileSync(file,'utf8');for(const id of Object.keys(products.cards))assert(!code.includes(id),`${file} hardcodes product ${id}`);for(const id of Object.keys(rules))assert(!code.includes(id),`${file} hardcodes Rule ID ${id}`)}
const exporter=fs.readFileSync('scripts/export_assessment_runtime_v2.py','utf8');
for(const id of ['OFFER_SHORT_HISTORY','LT_Q7_UNANSWERED','LT_Q8_UNANSWERED'])assert(!exporter.includes(`'${id}'`)&&!exporter.includes(`"${id}"`),`official exporter hardcodes policy template ${id}`);
for(const type of ['RENDER_POLICY_OFFER_DISPLAY_ID','RENDER_POLICY_LONG_TERM_TEMPLATE_ID'])assert(exporter.includes(type),`official exporter missing source-owned selection type ${type}`);
const validator=fs.readFileSync('scripts/validate_runtime_data_v2.py','utf8');
for(const bad of ["len(rules)==18","len(ids)==6","==120","chase_sapphire_preferred","bilt_palladium","capital_one_venture_x"])assert(!validator.includes(bad),`generic validator contains expansion blocker ${bad}`);
const build=fs.readFileSync('scripts/build_runtime_data.py','utf8');assert(build.includes('export_assessment_runtime_v2.py'));assert(build.includes('validate_runtime_data_v2.py'));assert(!build.includes("ROOT/'scripts/export_assessment_runtime.py'"));assert(!build.includes("ROOT/'scripts/validate_runtime_data.py'"));
const manifest=J('data/runtime-manifest.json'),lock=J('data/source-lock.json'),lockBytes=fs.readFileSync('data/source-lock.json');
const lockBlob=crypto.createHash('sha1').update(`blob ${lockBytes.length}\0`).update(lockBytes).digest('hex');
assert.equal(manifest.source_lock.git_blob_sha,lockBlob,'runtime manifest must lock the committed source-lock blob');
assert.match(lock.sources.report_templates.sha256,/^[0-9a-f]{64}$/,'reviewed report-template source must have a SHA256 lock');
console.log(JSON.stringify({products:Object.keys(products.cards).length,rules:Object.keys(rules).length,genericFiles:genericFiles.length,officialExporter:'v2',officialValidator:'v2',status:'PASS'}));
