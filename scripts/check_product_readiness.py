#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
def qids(c):
 out=set()
 for k in ('q5','q6'):
  q=c.get(k,{})
  if q.get('id'):out.add(q['id'])
  for s in q.get('subs',[]) or []:
   if s.get('id'):out.add(s['id'])
   if s.get('number_id'):out.add(s['number_id'])
 return out
def tri(n,p):
 op=n.get('op','ALWAYS')
 if op=='ALWAYS':return True
 if op=='AND':
  vals=[tri(x,p) for x in n.get('args',[])];return False if False in vals else None if None in vals else True
 if op=='OR':
  vals=[tri(x,p) for x in n.get('args',[])];return True if True in vals else None if None in vals else False
 if op=='NOT':
  v=tri(n['arg'],p);return None if v is None else not v
 v=p.get(n.get('field'))
 if v is None:return None
 if op=='EQ':return v==n.get('value')
 if op=='NEQ':return v!=n.get('value')
 if op=='IN':return v in n.get('values',[])
 if op=='NOT_IN':return v not in n.get('values',[])
 raise ValueError(op)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--product',action='append',dest='products');ap.add_argument('--json',action='store_true');a=ap.parse_args()
 P=load('data/products.json');Q=load('data/questions.json');F=load('data/fact-mapping.json');T=load('data/offer-timing.json');L=load('data/long-term.json');A=load('data/approval-config.json');R=load('data/bank-rules.json');D=load('data/bank-rule-predicates.json');X=load('data/report-templates.json')
 active=P['display_order'];requested=a.products or active;results=[]
 for pid in requested:
  errs=[];p=P.get('cards',{}).get(pid)
  if not p:errs.append('product_contract')
  else:
   req={'product_id','product_name','name','issuer','approval_issuer','product_type','customer_type','card_form','brand','generation','offer_timing_id','article_url','application_url'}
   if not req<=set(p):errs.append('canonical_product_fields')
   if p.get('approval_issuer') not in A.get('issuer_sensitivity',{}):errs.append('approval_route')
  qs=Q.get('cards',{}).get(pid,{});facts=F.get('cards',{}).get(pid,{}).get('facts',{});exposed=qids(qs)
  if not qs.get('q5') or not qs.get('q6'):errs.append('questions')
  for name,s in facts.items():
   for k in ('source','fallback_source'):
    if s.get(k) and s[k] not in exposed:errs.append(f'fact_source:{name}:{s[k]}')
  if pid not in T or T[pid].get('offer_timing_id')!=p.get('offer_timing_id'):errs.append('offer_timing')
  if pid not in L.get('cards',{}):errs.append('long_term')
  routed=[]
  for rid,d in D.items():
   state=tri(d['applicability']['target'],p or {})
   if state is None:errs.append(f'applicability_metadata:{rid}')
   elif state:routed.append(rid)
  if not routed:errs.append('bank_rule_route')
  for rid in routed:
   if rid not in R:errs.append(f'rule:{rid}')
   for f in D[rid].get('required_facts',[]):
    if f.get('fact') not in facts:errs.append(f'fact:{rid}:{f.get("fact")}')
   for tid in X.get('rule_template_index',{}).get(rid,[]):
    if tid not in X.get('rule_templates',{}):errs.append(f'template:{rid}:{tid}')
  if pid not in X.get('application_clear',{}):errs.append('application_clear')
  results.append({'product_id':pid,'targeted_rule_count':len(routed),'fact_count':len(facts),'errors':errs,'status':'PASS' if not errs else 'FAIL'})
 payload={'active_products':len(active),'checked_products':len(results),'products':results,'status':'PASS' if all(x['status']=='PASS' for x in results) else 'FAIL'}
 if a.json:print(json.dumps(payload,ensure_ascii=False,indent=2))
 else:
  for r in results:print(f"[{r['status']}] {r['product_id']} — {r['targeted_rule_count']} rules, {r['fact_count']} mapped facts"+((' | '+', '.join(r['errors'])) if r['errors'] else ''))
  print(json.dumps({'products':len(results),'status':payload['status']},ensure_ascii=False))
 return 0 if payload['status']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
