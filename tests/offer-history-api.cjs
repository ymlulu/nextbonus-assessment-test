const fs=require('fs');
const assert=require('assert/strict');
const Api=require('../adapters/assessment-api-v1.js');

const manifest=JSON.parse(fs.readFileSync('data/runtime-manifest.json','utf8'));
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const offerHistory=JSON.parse(fs.readFileSync('data/offer-history.json','utf8'));
const runtime={manifest,products,questions:{},longTerm:{},offerHistory};

const result=Api.getOfferHistory({productId:'amex_platinum',evaluationDate:'2026-09-15',runtime});
assert.ok(result,'reviewed offer history should exist for AMEX Platinum');
assert.equal(result.offer_timing_id,products.cards.amex_platinum.offer_timing_id);
assert.equal(result.snapshot,manifest.offer_history.snapshot);
assert.ok(Array.isArray(result.history)&&result.history.length>0,'eligible reviewed history should be returned');
assert.ok(result.history.every(row=>row.display_eligible===true),'only display-eligible rows may cross the API boundary');
assert.ok(result.history.every(row=>row.timing_eligible==='YES'),'only timing-eligible rows may cross the API boundary');
assert.ok(result.history.every(row=>row.confidence==='HIGH'),'only HIGH-confidence rows may cross the API boundary');
assert.ok(result.history.every(row=>row.bonus_label&&row.date_label),'every returned choice must retain reviewed reward and date labels');
assert.ok(result.history.some(row=>row.spend_requirement),'tracked reward conditions should be preserved when reviewed source contains them');
assert.throws(()=>Api.getOfferHistory({productId:'not_a_product',evaluationDate:'2026-09-15',runtime}),/Unknown product_id/);
assert.throws(()=>Api.getOfferHistory({productId:'amex_platinum',evaluationDate:'09\/15\/2026',runtime}),/evaluation_date must be YYYY-MM-DD/);

console.log(JSON.stringify({product:'amex_platinum',eligibleRows:result.history.length,source:'reviewed-offer-history',status:'PASS'}));