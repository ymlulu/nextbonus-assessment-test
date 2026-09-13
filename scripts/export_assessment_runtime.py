#!/usr/bin/env python3
"""Export deterministic Assessment runtime contracts from reviewed NextBonus workbooks.

This script does not parse natural-language business rules. It reads explicit tables from
Approval Engine, Long-term Holding Value, Assessment Orchestrator, and Full Report
Template Registry. A small, auditable compatibility layer preserves the currently
published nonblocking-report UX and three report-copy strings.

The report-template export is intentionally minimized to the templates referenced by the
current six-card runtime so the generated artifact matches the deployed runtime contract.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from openpyxl import load_workbook


def manifest_value(wb, key: str):
    ws = wb['Manifest']
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] == key:
            return row[1]
    raise KeyError(f'Manifest key missing: {key}')


def split_vars(value):
    if not value:
        return []
    return [x.strip() for x in str(value).split(';') if x and x.strip()]


def export_approval(path: Path):
    wb = load_workbook(path, data_only=True, read_only=True)
    assert manifest_value(wb, 'status') == 'FINAL'
    snap = str(manifest_value(wb, 'snapshot_date'))
    ws = wb['Base Matrix']
    headers = list(next(ws.iter_rows(values_only=True)))
    base = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0]:
            base[str(row[0])] = {str(headers[i]): row[i] for i in range(1, len(headers))}
    issuer = {str(r[0]): str(r[1]) for r in wb['Issuer Config'].iter_rows(min_row=2, values_only=True) if r[0]}
    adjustment = {
        'LOW': {'LOW': 0, 'MEDIUM': 0, 'HIGH': 0},
        'MEDIUM': {'LOW': 0, 'MEDIUM': 0, 'HIGH': 1},
        'HIGH': {'LOW': 0, 'MEDIUM': 1, 'HIGH': 1},
        'VERY_HIGH': {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2},
        'UNKNOWN': {'LOW': 0, 'MEDIUM': 0, 'HIGH': 0},
    }
    out = {
        'snapshot_date': snap,
        'base_matrix': base,
        'issuer_sensitivity': issuer,
        'activity_adjustment': adjustment,
        'product_overlays': {
            'bilt_palladium': [
                {'reason_code': 'BILT_THIN_FILE',
                 'when': {'op': 'IN', 'fact': 'credit_age_band', 'values': ['None', '<6m']},
                 'effect': {'op': 'CAP_AT', 'value': 'HIGH_RISK'}},
                {'reason_code': 'BILT_RECENT_ACTIVITY_HIGH',
                 'when': {'op': 'EQ', 'fact': 'applications_6m_severity', 'value': 3},
                 'effect': {'op': 'DOWNGRADE', 'steps': 1}},
                {'reason_code': 'BILT_NEW_ACCOUNTS_HIGH',
                 'when': {'op': 'EQ', 'fact': 'approved_cards_12m_severity', 'value': 3},
                 'effect': {'op': 'DOWNGRADE', 'steps': 1}},
            ]
        },
        'reason_code_maps': {
            'age': {'None': 'AGE_NONE', '<6m': 'AGE_LT6M', '6–11m': 'AGE_6_11M', '1–2y': 'AGE_1_2Y', '2y+': 'AGE_2Y_PLUS'},
            'score': {'740+': 'SCORE_740_PLUS', '700–739': 'SCORE_700_739', '670–699': 'SCORE_670_699', '<670': 'SCORE_LT670'},
        },
    }
    src = {str(r[2]): (str(r[0]), str(r[1])) for r in wb['Bilt 2.0 Overlay'].iter_rows(min_row=2, values_only=True) if r[2] and r[2] != 'BILT_BASE'}
    assert set(src) == {'BILT_THIN_FILE', 'BILT_RECENT_ACTIVITY_HIGH', 'BILT_NEW_ACCOUNTS_HIGH'}
    return out


def export_long_term(path: Path, registry_path: Path):
    wb = load_workbook(path, data_only=False, read_only=True)
    assert manifest_value(wb, 'status') == 'FINAL'
    snap = str(manifest_value(wb, 'snapshot_date'))
    reg = load_workbook(registry_path, data_only=True, read_only=True)
    short = {str(r[1]): str(r[3]) for r in reg['Benefit Short Labels'].iter_rows(min_row=3, values_only=True) if r[1]}
    cards = {}
    for r in wb['Card Config'].iter_rows(min_row=2, values_only=True):
        if r[0] and str(r[7]).upper() == 'ACTIVE':
            cards[str(r[0])] = {'name': str(r[1]), 'annual_fee': float(r[2] or 0), 'q7': [], 'q8': []}
    for r in wb['Quantifiable Benefits'].iter_rows(min_row=2, values_only=True):
        if not r[0] or r[0] not in cards:
            continue
        annual = float(r[4] or 0) * float(r[5] or 0) * float(r[6] or 0)
        cards[r[0]]['q7'].append({'id': str(r[1]), 'label': str(r[2]), 'annual_value': round(annual, 4), 'short': short.get(str(r[1]), str(r[2]))})
    for r in wb['Non-Quantifiable Benefits'].iter_rows(min_row=2, values_only=True):
        if not r[0] or r[0] not in cards or str(r[4]).upper() != 'YES':
            continue
        cards[r[0]]['q8'].append({'id': str(r[1]), 'label': str(r[2]), 'short': short.get(str(r[1]), str(r[2]))})
    bands, score_map, override = [], [], None
    for r in wb['Scoring Rules'].iter_rows(min_row=2, values_only=True):
        if r[0] == 'COMPONENT_RATIO':
            bands.append({'min': float(r[1]), 'max_exclusive': None if r[2] is None else float(r[2]), 'score': int(r[3])})
        elif r[0] == 'TOTAL_SCORE':
            code = {'很高':'VERY_HIGH','较高':'HIGH','一般':'MEDIUM','较低':'LOW','很低':'VERY_LOW'}[r[3]]
            score_map.append({'min': int(r[1]), 'max': int(r[2]), 'code': code, 'label': str(r[3])})
        elif r[0] == 'OVERRIDE':
            override = {'fee_score': int(r[1]), 'q8_selected_min': 1, 'code': 'VERY_HIGH', 'label': str(r[3]), 'reason_code': 'FEE_COVERED_PLUS_EXTRA_BENEFIT'}
    assert override
    return {'snapshot_date': snap, 'component_ratio_bands': bands, 'override': override, 'total_score_map': score_map, 'cards': cards}


def export_orchestrator(path: Path):
    wb = load_workbook(path, data_only=True, read_only=True)
    assert manifest_value(wb, 'status') == 'FINAL'
    snap = str(manifest_value(wb, 'snapshot_date'))
    source_priority = []
    for r in wb['Orchestrator Logic'].iter_rows(min_row=2, values_only=True):
        if r[0]:
            source_priority.append({'priority': int(r[0]), 'condition': str(r[1]), 'state': str(r[2]), 'recommended_action': str(r[3])})
    runtime_priority = [
        {'priority':1, 'state':'STOP_APPLICATION', 'when':{'op':'EQ','fact':'application_hard_behavior','value':'BLOCK'}},
        {'priority':2, 'state':'BONUS_BLOCK', 'when':{'op':'EQ','fact':'bonus_hard_behavior','value':'BLOCK'}},
        {'priority':3, 'state':'APPROVAL_RISK', 'when':{'op':'EQ','fact':'approval_after_soft_rules','value':'LOW'}},
        {'priority':4, 'state':'WAIT_APPLICATION_RULE', 'when':{'op':'EQ','fact':'application_hard_behavior','value':'WAIT'}},
        {'priority':5, 'state':'WAIT_BONUS_RULE', 'when':{'op':'EQ','fact':'bonus_hard_behavior','value':'WAIT'}},
        {'priority':6, 'state':'WAIT_SYSTEM_RULE', 'when':{'op':'EQ','fact':'system_knowledge_status','value':'KNOWLEDGE_GAP'}},
        {'priority':6.5, 'state':'WAIT_INFORMATION', 'when':{'op':'OR','args':[{'op':'EQ','fact':'adjusted_approval','value':'UNKNOWN'},{'op':'EQ','fact':'has_missing_critical','value':True}]}},
        {'priority':7, 'state':'WAIT_OFFER', 'when':{'op':'EQ','fact':'wait_recommendation','value':'WAIT'}},
        {'priority':8, 'state':'APPLY_NOW', 'when':{'op':'AND','args':[{'op':'EQ','fact':'approval_after_soft_rules','value':'HIGH'},{'op':'EQ','fact':'bonus_status','value':'YES'},{'op':'IN','fact':'offer_rating','values':['HISTORICAL_HIGH','HIGH']},{'op':'EQ','fact':'wait_recommendation','value':'NO_WAIT'}]}},
        {'priority':9, 'state':'CONSIDER', 'when':{'op':'ALWAYS'}},
    ]
    return {
        'snapshot_date': snap,
        'source_priority': source_priority,
        'runtime_priority': runtime_priority,
        'approval_bridge': {'HIGH':'HIGH','MEDIUM':'MEDIUM','HIGH_RISK':'LOW','INSUFFICIENT_DATA':'UNKNOWN'},
        'approval_label': {'HIGH':'较高','MEDIUM':'一般','LOW':'较低','VERY_LOW':'极低','UNKNOWN':'无法判断'},
        'offer_code': {'史高':'HISTORICAL_HIGH','较高':'HIGH','一般':'MEDIUM','较低':'LOW','无法判断':'UNKNOWN'},
        'wait_code': {'建议等待':'WAIT','不建议等待':'NO_WAIT','无法判断':'UNKNOWN'},
        'bonus_label': {'YES':'可以','NO':'不可以','UNCERTAIN':'不确定'},
        'runtime_extensions': {'WAIT_INFORMATION':'User-missing decisive facts still render a report instead of blocking for more questions; user-confirmed UX override.'},
    }


MISSING_FACT_INFO = {
 '过去 24 个月本人主卡新账户':{'dimension':'APPLICATION','hard':True,'text':'你没有确认过去 24 个月本人新开信用卡的数量，因此 Chase 5/24 是否触发目前无法判断。'},
 '过去 30 天 Chase 批卡数量':{'dimension':'APPLICATION','hard':True,'text':'你没有确认过去 30 天 Chase 的批卡数量，因此 Chase 2/30 是否触发目前无法判断。'},
 'CSP 开卡奖励历史':{'dimension':'BONUS','hard':True,'text':'你没有确认是否曾拿过 Chase Sapphire Preferred 的开卡奖励，因此这次开卡奖励资格目前无法判断。'},
 '当前 CSP 持卡状态':{'dimension':'APPLICATION','hard':True,'text':'你没有确认目前是否仍持有 Chase Sapphire Preferred，因此当前持卡限制是否适用目前无法判断。'},
 '同产品 90 天申请记录':{'dimension':'APPLICATION','hard':False,'text':'你没有确认过去 90 天是否申请或获批过这张 AMEX 卡，因此这项近期申请影响目前无法判断。'},
 'AMEX Charge / Pay Over Time 持卡数量':{'dimension':'APPLICATION','hard':False,'text':'你没有确认目前持有多少张 AMEX Gold / Platinum / Green 这类卡，因此持卡数量带来的申请影响目前无法判断。'},
 'AMEX 相关持卡历史':{'dimension':'BONUS','hard':True,'text':'你没有确认相关 AMEX 持卡历史，因此 lifetime / Family Rule 是否影响这次开卡奖励目前无法判断。'},
 'Bilt 2.0 持卡/奖励历史':{'dimension':'BONUS','hard':True,'text':'你没有确认 Bilt 2.0 的持卡或开卡奖励历史，因此这次开卡奖励资格目前无法判断。'},
 'Bilt 最近被拒记录':{'dimension':'APPLICATION','hard':True,'text':'你没有确认最近一次 Bilt 申请是否被拒，因此 45 天重新申请等待期是否适用目前无法判断。'},
 'Capital One 近 6 个月申请记录':{'dimension':'APPLICATION','hard':False,'text':'你没有确认最近 6 个月的 Capital One 申请记录，因此这项近期申请影响目前无法判断。'},
 'Capital One 30 天申请次数':{'dimension':'APPLICATION','hard':True,'text':'你没有确认过去 30 天 Capital One 的申请次数，因此当前 Offer 的近期申请限制是否触发目前无法判断。'},
 'Venture X 48 个月奖励历史':{'dimension':'BONUS','hard':True,'text':'你没有确认过去 48 个月的 Venture X 开卡奖励历史，因此这次开卡奖励资格目前无法判断。'},
 'Citi 8 天申请记录':{'dimension':'APPLICATION','hard':False,'text':'你没有确认过去 8 天的 Citi 个人卡申请记录，因此这项近期申请影响目前无法判断。'},
 'Citi 65 天申请次数':{'dimension':'APPLICATION','hard':True,'text':'你没有确认过去 65 天的 Citi 申请次数，因此 2/65 是否触发目前无法判断。'},
 'Strata Elite 48 个月奖励历史':{'dimension':'BONUS','hard':True,'text':'你没有确认过去 48 个月的 Strata Elite 开卡奖励历史，因此这次开卡奖励资格目前无法判断。'},
 'Strata Elite 转卡历史':{'dimension':'BONUS','hard':True,'text':'你没有确认是否曾把其他 Citi 卡转成 Strata Elite，因此 48 个月转卡条款是否影响奖励资格目前无法判断。'},
 '转入 Elite 的来源卡奖励历史':{'dimension':'BONUS','hard':True,'text':'你没有确认转入 Strata Elite 的来源卡奖励历史，因此 48 个月转卡条款是否影响奖励资格目前无法判断。'},
}


def export_templates(path: Path):
    wb = load_workbook(path, data_only=True, read_only=True)
    out = {'snapshot_date':'2026-09-13'}
    out['final_templates'] = {}
    for r in wb['Final Templates'].iter_rows(min_row=3, values_only=True):
        if r[1]: out['final_templates'][str(r[1])] = {'template_id':str(r[0]),'action':str(r[2]),'summary':str(r[3]),'cta_class':str(r[4]),'priority':r[5]}
    out['application_clear'] = {str(r[0]):str(r[3]) for r in wb['Application Clear'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['bonus_clear'] = {str(r[0]):str(r[2]) for r in wb['Bonus Clear'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['approval_reasons'] = {str(r[0]):{'text':str(r[4]),'polarity':str(r[2]),'priority':r[5]} for r in wb['Approval Reasons'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['approval_templates'] = {str(r[0]):str(r[2]) for r in wb['Approval Templates'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['long_term_templates'] = {str(r[0]):str(r[3]) for r in wb['Long-term Templates'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['cta'] = {str(r[0]):{'displayed_action':str(r[1]),'text':str(r[2]),'dest':str(r[3]),'pre':str(r[4]),'required_variable':r[5]} for r in wb['CTA Mapping'].iter_rows(min_row=3, values_only=True) if r[0]}
    out['rule_templates'] = {}
    out['rule_template_index'] = {}
    for r in wb['Rule Templates'].iter_rows(min_row=3, values_only=True):
        if not r[0]: continue
        tid=str(r[0]); rid=str(r[1]) if r[1] else None
        rec={'template_id':tid,'rule_id':rid,'module':r[2],'state':r[3],'render_policy':r[4],'coalesce_group':r[5],'priority':r[6],'text':str(r[7]),'required_variables':split_vars(r[8]),'fallback_template':r[9]}
        out['rule_templates'][tid]=rec
        if rid: out['rule_template_index'].setdefault(rid,[]).append(tid)
    out['offer_display']={}
    for r in wb['Offer Display Rules'].iter_rows(min_row=3, values_only=True):
        if r[0]: out['offer_display'][str(r[0])]={'trigger':r[1],'template':str(r[2]),'required_variables':split_vars(r[3])}
    out['missing_fact_info']=MISSING_FACT_INFO
    out['final_templates']['WAIT_INFORMATION']={'template_id':'FINAL_WAIT_INFORMATION_RUNTIME','action':'建议等待','summary':'有一些关键信息目前还不确定，完整报告里已经标出来。','cta_class':'RETURN','priority':6.5}
    out['cta']['WAIT_INFORMATION']={'displayed_action':'建议等待','text':'返回 Offer','dest':'offer_detail_url','pre':'报告里已经标出还无法判断的部分；之后确认信息后可以重新评估。','required_variable':'offer_detail_url'}
    out['bonus_uncertain_by_product']={'citi_strata_elite':'你没有确认完整的 Strata Elite 48 个月奖励 / 转卡历史，因此这次开卡奖励资格目前无法判断。'}
    overrides={
      'RULE_AMEX008_HIT_BUCKET':'你目前持有较多 AMEX Gold / Platinum / Green 这类卡，会增加一些申请难度，但不是硬性限制。',
      'RULE_AMEXFL001_HIT':'当前 Platinum Offer 有 Family Rule。你之前持有过 {trigger_product}，因此这次拿不到 Platinum 的开卡奖励。',
      'RULE_AMEX001_HIT':'当前 Offer 有历史持卡限制。你之前持有过这张卡，因此目前拿不到这次开卡奖励。',
    }
    for tid,text in overrides.items():
        assert tid in out['rule_templates']
        out['rule_templates'][tid]['text']=text
        if tid=='RULE_AMEX001_HIT': out['rule_templates'][tid]['required_variables']=[]
    out['runtime_extensions']={'WAIT_INFORMATION':'User-confirmed nonblocking report state for unresolved user facts.','deployed_copy_overrides':list(overrides)}

    keep_rule_ids = {
        'CHASE-001','CHASE-002','CHASE-003','CHASE-010','CHASE-PROD-017',
        'AMEX-011','AMEX-008','AMEX-001','AMEX-FL-001','AMEX-FL-004',
        'BILT-001','BILT-003','CAP1-001','CAP1-002','CAP1-004',
        'CITI-001','CITI-002','CITI-PROD-009',
    }
    keep_template_ids = {
        'RULE_CHASE001_HIT','RULE_CHASE002_HIT','RULE_CHASE003_HIT','RULE_CSP017_HIT',
        'RULE_AMEX011_HIT','RULE_AMEX008_HIT','RULE_AMEX001_HIT','RULE_AMEXFL001_HIT',
        'RULE_AMEXFL004_HIT','RULE_BILT001_HIT','RULE_BILT003_HIT','RULE_CAP1001_HIT',
        'RULE_CAP1002_HIT','RULE_CAP1004_HIT','RULE_CITI001_HIT','RULE_CITI002_HIT',
        'RULE_CITIP009_BONUS','RULE_CITIP009_CONV','RULE_WAIT_CONDITION',
        'RULE_CHASE001_HIT_BUCKET','RULE_CHASE002_HIT_BUCKET','RULE_CITI002_HIT_BUCKET',
        'RULE_CAP1002_HIT_BUCKET','RULE_AMEX008_HIT_BUCKET','RULE_CHASE010_EDGE_BUCKET',
    }
    keep_offer_display = {
        'OFFER_ATH','OFFER_HIGH','OFFER_MEDIUM','OFFER_LOW','OFFER_UNKNOWN',
        'OFFER_AS_HIGH_AS','OFFER_WAIT_APPEND','SHORT_HISTORY',
    }
    out['final_templates'] = {k:{'action':v['action'],'summary':v['summary']} for k,v in out['final_templates'].items()}
    out['cta'] = {k:{'text':v['text'],'dest':v['dest'],'pre':v['pre']} for k,v in out['cta'].items()}
    out['rule_templates'] = {k:{'state':v['state'],'text':v['text']} for k,v in out['rule_templates'].items() if k in keep_template_ids}
    out['rule_template_index'] = {
        rid:[tid for tid in tids if tid in keep_template_ids]
        for rid,tids in out['rule_template_index'].items() if rid in keep_rule_ids
    }
    out['offer_display'] = {k:{'template':v['template']} for k,v in out['offer_display'].items() if k in keep_offer_display}
    return out


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--approval', type=Path, required=True)
    ap.add_argument('--long-term', type=Path, required=True)
    ap.add_argument('--orchestrator', type=Path, required=True)
    ap.add_argument('--registry', type=Path, required=True)
    ap.add_argument('--out-dir', type=Path, required=True)
    args=ap.parse_args(); args.out_dir.mkdir(parents=True,exist_ok=True)
    outputs={
      'approval-config.json':export_approval(args.approval),
      'long-term.json':export_long_term(args.long_term,args.registry),
      'orchestrator.json':export_orchestrator(args.orchestrator),
      'report-templates.json':export_templates(args.registry),
    }
    for name,data in outputs.items():
        (args.out_dir/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'status':'PASS','files':list(outputs),'cards':len(outputs['long-term.json']['cards']),'report_rule_templates':len(outputs['report-templates.json']['rule_templates'])},ensure_ascii=False))

if __name__=='__main__': main()
