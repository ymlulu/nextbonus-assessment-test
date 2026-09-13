#!/usr/bin/env python3
"""Expansion-safe validator for committed NextBonus Assessment runtime contracts.

This validator checks structural integrity and provenance only. Product-specific business
regressions belong in dedicated tests, so adding an active product does not require
editing generic validation code merely to change counts or named-product assertions.
"""
from __future__ import annotations
import gzip,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
def blob(p):
 d=(ROOT/p).read_bytes();return hashlib.sha1(b'blob '+str(len(d)).encode()+b'\0'+d).hexdigest()
def walk(n):
 assert isinstance(n,dict) and n.get('op') in {'EQ','NEQ','GT','GTE','LT','LTE','IN','NOT_IN','CONTAINS','AND','OR','NOT','ANY','EXISTS','MISSING','ALWAYS'}
 for x in n.get('args',[]):walk(x)
 if n.get('arg') is not None:walk(n['arg'])
def qids(card):
 out=set()
 for key in ('q5','q6'):
  block=card.get(key,{})
  if block.get('id'):out.add(block['id'])
  for sub in block.get('subs',[]) or []:
   if sub.get('id'):out.add(sub['id'])
   if sub.get('number_id'):out.add(sub['number_id'])
 return out
def check_opts(block):
 if block.get('options') is not None:
  for o in block['options']:assert isinstance(o,dict) and {'value','label'}<=set(o)
 for s in block.get('subs',[]) or []:check_opts(s)
def target_tri(n,p):
 op=n.get('op','ALWAYS')
 if op=='ALWAYS':return True
 if op=='AND':
  vals=[target_tri(x,p) for x in n.get('args',[])];return False if False in vals else None if None in vals else True
 if op=='OR':
  vals=[target_tri(x,p) for x in n.get('args',[])];return True if True in vals else None if None in vals else False
 if op=='NOT':
  v=target_tri(n['arg'],p);return None if v is None else not v
 v=p.get(n.get('field'))
 if v is None:return None
 if op=='EQ':return v==n.get('value')
 if op=='NEQ':return v!=n.get('value')
 if op=='IN':return v in n.get('values',[])
 if op=='NOT_IN':return v not in n.get('values',[])
 raise AssertionError(f'unsupported target predicate {op}')

manifest=load('data/runtime-manifest.json');lock=load(manifest['source_lock']['path']);registry=load('config/runtime-source-registry.json');contracts=load('config/source-contract-registry.json');qa_registry=load('config/qa-source-registry.json')
assert str(lock['schema_version'])==str(manifest['source_lock']['schema_version']);assert manifest['source_lock']['git_blob_sha']==blob(manifest['source_lock']['path'])
assert set(registry['sources'])==set(lock['sources'])
for k,m in registry['sources'].items():
 l=lock['sources'][k];assert m['file_name']==l['file_name'];assert m['source_kind']==l['source_kind'];assert str(m['snapshot'])==str(l['snapshot']);assert re.fullmatch(r'[0-9a-f]{64}',l['sha256'])
 if m.get('drive_id') is not None:assert m['drive_id']==l.get('drive_id')
assert set(qa_registry['sources'])==set(lock.get('qa_sources',{}))
for k,m in qa_registry['sources'].items():assert m==lock['qa_sources'][k] and re.fullmatch(r'[0-9a-f]{64}',m['sha256'])
for group in ('repo_contracts','generated_runtime'):
 for k,r in lock.get(group,{}).items():assert (ROOT/r['path']).is_file() and blob(r['path'])==r['git_blob_sha'],f'locked Git blob drift: {k}'
keys=[k for k,v in manifest.items() if isinstance(v,dict) and v.get('path') and k!='source_lock']
for k in keys:
 r=manifest[k];assert (ROOT/r['path']).is_file() and blob(r['path'])==r['git_blob_sha'],f'manifest Git blob drift: {k}'
required_runtime={'bank_rules','bank_rule_predicates','offer_timing','approval','long_term','orchestrator','report_templates','report_render_policy','products','questions','fact_mapping','frozen_offer_facts'}
assert required_runtime<=set(keys)
rules=load(manifest['bank_rules']['path']);pred=load(manifest['bank_rule_predicates']['path']);timing=load(manifest['offer_timing']['path']);products=load(manifest['products']['path']);questions=load(manifest['questions']['path']);mapping=load(manifest['fact_mapping']['path']);approval=load(manifest['approval']['path']);lt=load(manifest['long_term']['path']);orch=load(manifest['orchestrator']['path']);base=load(manifest['report_templates']['path']);policy=load(manifest['report_render_policy']['path']);frozen=load(manifest['frozen_offer_facts']['path'])
templates={**base,**policy,'rule_templates':{**base.get('rule_templates',{}),**policy.get('rule_templates',{})},'rule_template_index':{**base.get('rule_template_index',{}),**policy.get('rule_template_index',{})},'offer_display':{**base.get('offer_display',{}),**policy.get('offer_display',{})},'long_term_templates':{**base.get('long_term_templates',{}),**policy.get('long_term_templates',{})}}
assert rules and set(rules)==set(pred)
for rid,p in pred.items():walk(p['trigger']);walk(p['applicability']['target']);walk(p['applicability']['gate']);assert 'target_products' not in p['applicability']
ids=set(products.get('cards',{}));order=products.get('display_order',[]);assert ids and len(order)==len(set(order)) and set(order)==ids
for x in (set(timing),set(lt.get('cards',{})),set(questions.get('cards',{})),set(mapping.get('cards',{}))):assert x==ids
required={'product_id','product_name','name','issuer','approval_issuer','product_type','customer_type','card_form','brand','generation','sensitivity','offer_timing_id','article_url','application_url'}
for pid,p in products['cards'].items():
 assert required<=set(p),f'missing canonical metadata {pid}';assert p['product_id']==pid;assert p['approval_issuer'] in approval.get('issuer_sensitivity',{});assert timing[pid]['offer_timing_id']==p['offer_timing_id']
 qs=questions['cards'][pid];exposed=qids(qs);facts=mapping['cards'][pid].get('facts',{})
 assert qs.get('q5') and qs.get('q6')
 for name,spec in facts.items():
  for src in ('source','fallback_source'):
   if spec.get(src):assert spec[src] in exposed,f'{pid} fact {name} references missing question {spec[src]}'
 routed=[]
 for rid,d in pred.items():
  state=target_tri(d['applicability']['target'],p);assert state is not None,f'{pid} missing applicability metadata for {rid}'
  if state:routed.append(rid)
 assert routed,f'{pid} routes to no Bank Rules'
 for rid in routed:
  for req in pred[rid].get('required_facts',[]):assert req.get('fact') in facts,f'{pid} missing fact {req.get("fact")} for {rid}'
  assert templates.get('rule_template_index',{}).get(rid),f'{pid} routed rule {rid} has no report template'
 assert pid in base.get('application_clear',{}),f'{pid} missing application_clear'
for q in questions.get('common',[]):check_opts(q)
for c in questions['cards'].values():check_opts(c['q5']);check_opts(c['q6'])
assert mapping.get('unknown_values') and all(isinstance(x,str) for x in mapping['unknown_values'])
for pid in frozen.get('products',{}):assert pid in ids,f'frozen offer facts reference inactive product {pid}'
c=contracts['contracts'];assert set(c['questions']['documents'])==ids
for key in ('bank_rule_predicates','frozen_offer_facts','approval','long_term','orchestrator','report_templates','report_render_policy','offer_timing'):assert key in c
states={x['state'] for x in orch.get('runtime_priority',[])};assert states and states<=set(base.get('final_templates',{})) and states<=set(base.get('cta',{}))
for x in orch['runtime_priority']:walk(x['when'])
for rid,rows in policy.get('rule_variant_routing',{}).items():
 assert rid in rules
 for x in rows:walk(x['when'])
for x in policy.get('rule_suppression',[]):assert x['trigger_rule_id'] in rules and x['suppress_rule_id'] in rules
for x in policy.get('approval_render_policy',[]):walk(x['when']);assert x['template_id'] in base.get('approval_templates',{})
for x in policy.get('offer_render_routing',[]):walk(x['when']);assert x['template_id'] in templates.get('offer_display',{})
for x in policy.get('long_term_render_routing',[]):walk(x['when']);assert x['template_id'] in templates.get('long_term_templates',{})
assert manifest.get('release_id') and manifest.get('engine') and all(str(v).strip() for v in manifest['engine'].values())
qf=qa_registry['fixture'];qa=load(qf['path']);assert qa['schema_version']==qf['schema_version'];assert qa['fixture_id']==qf['fixture_id'];assert qa['case_count']==qf['case_count'];assert qa['evaluation_date']==qf['evaluation_date']
for k,s in qa_registry['sources'].items():
 p=qa['source_provenance'][k];assert p['file_name']==s['file_name'] and p['drive_id']==s['drive_id'] and p['sha256']==s['sha256']
art=qa['artifact'];data=(ROOT/art['path']).read_bytes();assert blob(art['path'])==art['git_blob_sha'];assert hashlib.sha256(data).hexdigest()==art['sha256'];raw=gzip.decompress(data);assert len(data)==art['compressed_bytes'] and len(raw)==art['uncompressed_bytes'] and hashlib.sha256(raw).hexdigest()==art['uncompressed_sha256'];payload=json.loads(raw);cases=payload['cases'];assert payload['case_count']==len(cases)==qa['case_count'];assert payload['evaluation_date']==qa['evaluation_date'];assert all(x['evaluation_date']==qa['evaluation_date'] for x in cases);assert {x['product_id'] for x in cases}<=ids
index=(ROOT/'index.html').read_text(encoding='utf-8');assert 'src="assets/bootstrap-v3.js"' in index and 'src="engines/assessment-runtime-engine-v3.js"' in index
print(json.dumps({'runtime_files':len(keys),'repo_contracts':len(lock.get('repo_contracts',{})),'qa_sources':len(lock.get('qa_sources',{})),'qa_cases':qa['case_count'],'rules':len(rules),'products':len(ids),'status':'PASS'},ensure_ascii=False))
