#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
def blob(p):
 d=(ROOT/p).read_bytes();return hashlib.sha1(b'blob '+str(len(d)).encode()+b'\0'+d).hexdigest()
def walk(n):
 assert n.get('op') in {'EQ','NEQ','GT','GTE','LT','LTE','IN','NOT_IN','CONTAINS','AND','OR','NOT','ANY','EXISTS','MISSING','ALWAYS'}
 for x in n.get('args',[]):walk(x)
 if n.get('arg'):walk(n['arg'])
manifest=load('data/runtime-manifest.json');lock=load(manifest['source_lock']['path']);registry=load('config/runtime-source-registry.json');contracts=load('config/source-contract-registry.json')
assert set(registry['sources'])==set(lock['sources'])
for k,m in registry['sources'].items():
 l=lock['sources'][k];assert m['file_name']==l['file_name'];assert m['source_kind']==l['source_kind'];assert str(m['snapshot'])==str(l['snapshot']);assert re.fullmatch(r'[0-9a-f]{64}',l['sha256'])
 if m.get('drive_id') is not None:assert m['drive_id']==l.get('drive_id')
for group in ('repo_contracts','generated_runtime'):
 for k,r in lock[group].items():
  assert (ROOT/r['path']).is_file(),r['path'];assert blob(r['path'])==r['git_blob_sha'],f'locked Git blob drift: {k}'
keys=['bank_rules','bank_rule_predicates','offer_timing','offer_history','offer_history_validation','approval','long_term','orchestrator','report_templates','report_render_policy','products','questions','fact_mapping','frozen_offer_facts']
for k in keys:
 r=manifest[k];assert (ROOT/r['path']).is_file();assert blob(r['path'])==r['git_blob_sha'],f'manifest Git blob drift: {k}'
rules=load(manifest['bank_rules']['path']);pred=load(manifest['bank_rule_predicates']['path']);timing=load(manifest['offer_timing']['path']);products=load(manifest['products']['path']);questions=load(manifest['questions']['path']);mapping=load(manifest['fact_mapping']['path']);approval=load(manifest['approval']['path']);lt=load(manifest['long_term']['path']);orch=load(manifest['orchestrator']['path']);templates=load(manifest['report_templates']['path']);policy=load(manifest['report_render_policy']['path']);templates={**templates,**policy,'rule_templates':{**templates.get('rule_templates',{}),**policy.get('rule_templates',{})},'rule_template_index':{**templates.get('rule_template_index',{}),**policy.get('rule_template_index',{})},'offer_display':{**templates.get('offer_display',{}),**policy.get('offer_display',{})},'long_term_templates':{**templates.get('long_term_templates',{}),**policy.get('long_term_templates',{})}};frozen=load(manifest['frozen_offer_facts']['path'])
assert set(rules)==set(pred) and len(rules)==18
for rid,p in pred.items():
 walk(p['trigger']);walk(p['applicability']['target']);walk(p['applicability']['gate']);assert 'target_products' not in p['applicability']
ids=set(products['cards']);assert len(ids)==6
for x in (set(timing),set(lt['cards']),set(questions['cards']),set(mapping['cards'])):assert x==ids
required={'product_id','product_name','name','issuer','approval_issuer','product_type','customer_type','card_form','brand','generation','sensitivity','offer_timing_id','article_url','application_url'}
for pid,p in products['cards'].items():
 assert required<=set(p),f'missing canonical metadata {pid}';assert p['product_id']==pid;assert p['approval_issuer'] in approval['issuer_sensitivity'];assert timing[pid]['offer_timing_id']==p['offer_timing_id']
b=products['cards']['bilt_palladium'];assert (b['issuer'],b['brand'],b['generation'],b['approval_issuer'])==('COLUMN_NA','BILT','BILT_2_0','BILT')
def check_opts(block):
 if block.get('options') is not None:
  for o in block['options']:assert isinstance(o,dict) and set(o)>={'value','label'}
 for s in block.get('subs',[]) or []:check_opts(s)
for q in questions['common']:check_opts(q)
for c in questions['cards'].values():check_opts(c['q5']);check_opts(c['q6'])
assert questions['cards']['capital_one_venture_x']['q5']['subs'][1]['system_gate']=={'fact':'COF_CAP1_30D_CLAUSE_STATE','equals':'PRESENT'}
assert frozen['products']['capital_one_venture_x']['COF_CAP1_30D_CLAUSE_STATE']=='PRESENT';assert frozen['products']['capital_one_venture_x']['COF_CAP1_OPEN_ACCOUNT_CAP_STATE']=='ABSENT';assert frozen['products']['capital_one_venture_x']['COF_CAP1_OPEN_ACCOUNT_CAP_LIMIT'] is None
assert mapping['unknown_values']==['UNKNOWN']
c=contracts['contracts'];assert contracts['schema_version']=='3';assert c['questions']['authority']=='google_drive_reviewed_docs';assert set(c['questions']['documents'])==ids;assert c['bank_rule_predicates']['authority']=='google_drive_reviewed_workbook_mirror';assert c['frozen_offer_facts']['authority']=='google_drive_reviewed_workbook_mirror'
for key in ('approval','long_term','orchestrator','report_templates','report_render_policy','offer_timing'):
 assert c[key]['authority']=='google_drive_reviewed_workbook',key
states={x['state'] for x in orch['runtime_priority']};assert states<=set(templates['final_templates']);assert states<=set(templates['cta']);assert 'WAIT_INFORMATION' in states
for x in orch['runtime_priority']:walk(x['when'])
assert templates['rule_variant_routing'] and templates['rule_suppression'] and templates['render_variable_bindings'];assert templates['approval_render_policy'] and templates['offer_render_routing'] and templates['long_term_render_routing']
for rows in templates['rule_variant_routing'].values():
 for x in rows:walk(x['when'])
for x in templates['approval_render_policy']+templates['offer_render_routing']+templates['long_term_render_routing']:walk(x['when'])
assert lock['generated_runtime']['offer_timing']['generation_mode']=='generated_from_reviewed_workbook'
assert manifest['engine']['fact_normalizer']=='3.2';assert manifest['engine']['approval_engine']=='2.1';assert manifest['engine']['bank_rule_engine']=='2';assert manifest['engine']['report_renderer']=='3.0';assert manifest['engine']['assessment_runtime']=='3.2'
index=(ROOT/'index.html').read_text(encoding='utf-8');assert 'src="assets/bootstrap-v3.js"' in index and 'src="engines/assessment-runtime-engine-v3.js"' in index
print(json.dumps({'runtime_files':len(keys),'repo_contracts':len(lock['repo_contracts']),'rules':len(rules),'products':len(ids),'render_policies':len(templates['approval_render_policy'])+len(templates['offer_render_routing'])+len(templates['long_term_render_routing']),'status':'PASS'},ensure_ascii=False))
