#!/usr/bin/env python3
"""Report per-product Phase 6 expansion gaps without activating draft candidates."""
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def J(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
plan=J('config/expansion-candidates.json');products=J('data/products.json');questions=J('data/questions.json');facts=J('data/fact-mapping.json');timing=J('data/offer-timing.json');lt=J('data/long-term.json');frozen=J('data/frozen-offer-facts.json');templates=J('data/report-templates.json')
active=set(products.get('cards',{}));rows=[]
for p in plan['products']:
 pid=p['product_id'];checks={
  'product_metadata':pid in active,
  'questions':pid in questions.get('cards',{}),
  'fact_mapping':pid in facts.get('cards',{}),
  'runtime_timing':pid in timing,
  'long_term':pid in lt.get('cards',{}),
  'frozen_offer_facts':pid in frozen.get('products',{}),
  'application_clear':pid in templates.get('application_clear',{}),
  'bonus_uncertain_copy':pid in templates.get('bonus_uncertain_by_product',{}),
 }
 required=['product_metadata','questions','fact_mapping','runtime_timing','long_term','frozen_offer_facts','application_clear']
 missing=[k for k in required if not checks[k]]
 rows.append({'product_id':pid,'product_name':p['product_name'],'stage':p['stage'],'offer_timing_id':p['offer_timing_id'],'runtime_ready':not missing,'missing':missing,'checks':checks})
assert len(rows)==plan['target_count']==len({x['product_id'] for x in rows})
reviewed=[x for x in rows if x['stage']=='ACTIVE_REVIEWED'];candidates=[x for x in rows if x['stage']=='EXPANSION_CANDIDATE']
assert {x['product_id'] for x in reviewed}==active,'ACTIVE_REVIEWED must exactly mirror current runtime products'
assert all(x['runtime_ready'] for x in reviewed),'current reviewed products must stay complete'
print(json.dumps({'status':'PASS','plan_status':plan['status'],'target_count':len(rows),'active_reviewed':len(reviewed),'expansion_candidates':len(candidates),'candidate_runtime_ready':sum(x['runtime_ready'] for x in candidates),'rows':rows},ensure_ascii=False,indent=2))
