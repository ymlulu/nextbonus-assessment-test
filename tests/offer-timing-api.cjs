const fs=require('fs');
const assert=require('assert/strict');
const Api=require('../adapters/assessment-api-v1.js');

const manifest=JSON.parse(fs.readFileSync('data/runtime-manifest.json','utf8'));
const products=JSON.parse(fs.readFileSync('data/products.json','utf8'));
const timing=JSON.parse(fs.readFileSync('data/offer-timing.json','utf8'));
const runtime={manifest,products,questions:{},longTerm:{},timing};

const result=Api.getOfferTiming({productId:'amex_platinum',runtime});
assert.equal(result.product_id,'amex_platinum');
assert.equal(result.offer_timing_id,'OT-AMEX-001');
assert.equal(result.current_offer.comparable_value,2625);
assert.equal(result.current_offer.comparison_unit,'USD_NORM');
assert.equal(result.timing_result.rating,'史高');
assert.throws(()=>Api.getOfferTiming({productId:'not_a_product',runtime}),/Unknown product_id/);

console.log(JSON.stringify({product:'amex_platinum',comparableValue:result.current_offer.comparable_value,source:'offer-timing',status:'PASS'}));
