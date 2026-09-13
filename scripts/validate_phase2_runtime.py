#!/usr/bin/env python3
import json, sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def load(rel): return json.loads((root/rel).read_text(encoding='utf-8'))
m=load('data/runtime-manifest.json')
for k in ['bank_rules','bank_rule_predicates','offer_timing','approval','long_term','orchestrator','report_templates']:
    assert k in m and (root/m[k]['path']).exists(), f'missing manifest/runtime file: {k}'
a=load(m['approval']['path']); lt=load(m['long_term']['path']); o=load(m['orchestrator']['path']); t=load(m['report_templates']['path'])
assert len(a['base_matrix'])==6 and set(a['issuer_sensitivity']) >= {'AMEX','CHASE','CITI','CAPITAL_ONE','BILT'}
assert set(lt['cards'])=={'chase_sapphire_preferred','amex_gold','amex_platinum','bilt_palladium','capital_one_venture_x','citi_strata_elite'}
assert len(o['runtime_priority'])>=10 and o['runtime_priority'][-1]['state']=='CONSIDER'
needed={'APPLY_NOW','CONSIDER','WAIT_APPLICATION_RULE','WAIT_BONUS_RULE','WAIT_SYSTEM_RULE','WAIT_INFORMATION','WAIT_OFFER','STOP_APPLICATION','BONUS_BLOCK','APPROVAL_RISK'}
assert needed <= set(t['final_templates']) and needed <= set(t['cta'])
assert len(t['rule_templates'])>=25
assert all(x in t['approval_reasons'] for x in ['AGE_NONE','SCORE_740_PLUS','ACTIVITY_VERY_HIGH','BILT_THIN_FILE'])
print(json.dumps({'status':'PASS','release_id':m['release_id'],'approval_rows':len(a['base_matrix']),'long_term_cards':len(lt['cards']),'orchestrator_states':len(o['runtime_priority']),'report_rule_templates':len(t['rule_templates'])},ensure_ascii=False))
