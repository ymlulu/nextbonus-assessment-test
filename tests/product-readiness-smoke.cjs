const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');

const root = path.resolve(__dirname, '..');
const load = (ctx, rel) => vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx);
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));

function runtime() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const file of [
    'engines/bank-rule-engine.js',
    'engines/timing-engine.js',
    'engines/fact-normalizer.js',
    'engines/approval-engine.js',
    'engines/long-term-engine.js',
    'engines/orchestrator-engine.js',
    'engines/report-renderer.js',
    'engines/assessment-runtime-engine-v3.js',
  ]) {
    load(ctx, file);
    Object.assign(ctx, ctx.window);
  }

  const products = readJson('products.json');
  const longTerm = readJson('long-term.json');
  const timing = readJson('offer-timing.json');
  const cards = {};
  for (const [id, product] of Object.entries(products.cards)) {
    const lt = longTerm.cards[id];
    assert.ok(lt, `missing Long-term config for ${id}`);
    cards[id] = {
      key: id,
      name: product.name,
      issuer: product.issuer,
      sensitivity: product.sensitivity,
      annualFee: lt.annual_fee,
      article: product.article_url,
      applicationUrl: product.application_url,
      q7: lt.q7.map(v => ({ id: v.id, label: v.label, annualValue: v.annual_value, short: v.short })),
      q8: lt.q8.map(v => ({ id: v.id, label: v.label, short: v.short })),
    };
  }

  ctx.window.NB_CONFIG = {
    snapshotDate: products.snapshot_date,
    engineVersion: 'runtime-3',
    cards,
  };
  ctx.NB_CONFIG = ctx.window.NB_CONFIG;
  ctx.window.NBRuntime = {
    rules: readJson('bank-rules.json'),
    predicates: readJson('bank-rule-predicates.json'),
    timing,
    approval: readJson('approval-config.json'),
    longTerm,
    orchestrator: readJson('orchestrator.json'),
    reportTemplates: readJson('report-templates.json'),
    factMapping: readJson('fact-mapping.json'),
  };
  ctx.NBRuntime = ctx.window.NBRuntime;
  ctx.TimingAdapter.hydrate(cards, timing);
  return ctx;
}

const ctx = runtime();
const products = readJson('products.json');
const expected = products.display_order;
assert.deepEqual(new Set(expected), new Set(Object.keys(products.cards)), 'display_order/cards mismatch');

const blankAnswers = () => ({
  a1: null,
  a2: null,
  a3: null,
  a4: null,
  specific: {},
  q7: [],
  q8: [],
  q7Answered: false,
  q8Answered: false,
});

const checked = [];
for (const productId of expected) {
  const first = ctx.AssessmentRuntimeEngineV3.evaluate(productId, blankAnswers());
  const second = ctx.AssessmentRuntimeEngineV3.evaluate(productId, blankAnswers());
  assert.equal(JSON.stringify(first), JSON.stringify(second), `${productId} is not deterministic for identical input`);
  assert.equal(first.cardKey, productId);
  assert.ok(first.report, `${productId} did not render a report`);
  assert.ok(first.output && first.output.internalState, `${productId} did not produce an orchestrator state`);
  assert.ok(first.output.recommendedAction, `${productId} did not produce a recommended action`);
  checked.push(productId);
}

console.log(JSON.stringify({ products: checked.length, productIds: checked, deterministicRuns: checked.length * 2, status: 'PASS' }));
