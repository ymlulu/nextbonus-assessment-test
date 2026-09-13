#!/usr/bin/env python3
"""Phase 5E+ source-owned Assessment exporter.

Reuses structural workbook parsers from export_assessment_runtime.py, while every
Runtime Export Selection type is handled dynamically so new reviewed selection classes
do not require product-specific exporter changes.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
from openpyxl import load_workbook
import export_assessment_runtime as base


def selection(wb):
    out={}
    for r in base.rows_by_header(wb['Runtime Export Selection'],header_row=1):
        if int(r.get('Active') or 0)==1:
            out.setdefault(str(r['Selection Type']),set()).add(str(r['ID']))
    return out


def export_templates(path: Path):
    wb=load_workbook(path,data_only=True,read_only=True)
    if str(base.manifest_value(wb,'status')).upper()!='FINAL': raise ValueError('Report registry source is not FINAL')
    s=selection(wb); out={'snapshot_date':str(base.manifest_value(wb,'snapshot_date'))}
    out['final_templates']={str(r['Internal State']):{'action':str(r['Displayed Action']),'summary':str(r['Summary Template'])} for r in base.rows_by_header(wb['Final Templates']) if r.get('Internal State')}
    out['application_clear']={str(r['Card Key']):str(r['Clear Summary']) for r in base.rows_by_header(wb['Application Clear']) if r.get('Card Key')}
    out['bonus_clear']={str(r['Template ID']):str(r['Template Text']) for r in base.rows_by_header(wb['Bonus Clear']) if r.get('Template ID')}
    out['approval_reasons']={str(r['Reason Code']):{'text':str(r['Template Text']),'polarity':str(r['Polarity']),'priority':r['Display Priority']} for r in base.rows_by_header(wb['Approval Reasons']) if r.get('Reason Code')}
    out['approval_templates']={str(r['Template ID']):str(r['Main Template']) for r in base.rows_by_header(wb['Approval Templates']) if r.get('Template ID')}
    out['cta']={str(r['Internal State']):{'text':str(r['CTA Text']),'dest':str(r['Destination']),'pre':str(r['Pre-CTA Template'])} for r in base.rows_by_header(wb['CTA Mapping']) if r.get('Internal State')}
    out['long_term_templates']={str(r['Template ID']):str(r['Template Text']) for r in base.rows_by_header(wb['Long-term Templates']) if r.get('Template ID') and str(r['Template ID']) in s.get('LONG_TERM_TEMPLATE_ID',set())}
    out['rule_templates']={};out['rule_template_index']={}
    for r in base.rows_by_header(wb['Rule Templates']):
        tid=str(r['Template ID']);rid=str(r['Rule ID']) if r.get('Rule ID') else None
        if tid in s.get('TEMPLATE_ID',set()):out['rule_templates'][tid]={'state':r.get('State'),'text':str(r['Template Text'])}
        if rid and rid in s.get('RULE_ID',set()) and tid in s.get('TEMPLATE_ID',set()):out['rule_template_index'].setdefault(rid,[]).append(tid)
    out['offer_display']={str(r['Template ID / Policy']):{'template':str(r['Template / Rule'])} for r in base.rows_by_header(wb['Offer Display Rules']) if r.get('Template ID / Policy') and str(r['Template ID / Policy']) in s.get('OFFER_DISPLAY_ID',set())}
    out['missing_fact_info']={str(r['Missing Label']):{'dimension':str(r['Dimension']),'hard':bool(r['Hard']),'text':str(r['Template Text'])} for r in base.rows_by_header(wb['Missing Fact Templates']) if r.get('Missing Label')}
    out['bonus_uncertain_by_product']={str(r['Product ID']):str(r['Template Text']) for r in base.rows_by_header(wb['Bonus Uncertain by Product']) if r.get('Product ID')}
    ext={};list_items={}
    for r in base.rows_by_header(wb['Runtime Extensions'],header_row=1):
        key=str(r['Key']);typ=str(r['Value Type']);val=r['Value']
        if typ=='STRING':ext[key]=str(val)
        elif typ=='LIST_ITEM':list_items.setdefault(key,[]).append((int(r['Order'] or 0),str(val)))
    for k,items in list_items.items():ext[k]=[v for _,v in sorted(items)]
    out['runtime_extensions']=ext
    return out


def export_render_policy(path: Path):
    wb=load_workbook(path,data_only=True,read_only=True); s=selection(wb)
    out={'rule_templates':{},'rule_template_index':{}}
    for r in base.rows_by_header(wb['Rule Templates']):
        tid=str(r['Template ID']); rid=str(r['Rule ID']) if r.get('Rule ID') else None
        if tid not in s.get('TEMPLATE_ID',set()): continue
        out['rule_templates'][tid]={'template_id':tid,'rule_id':rid,'state':r.get('State'),'text':str(r['Template Text']),'required_variables':base.split_vars(r.get('Required Variables')),'fallback_template':r.get('Fallback Template')}
        if rid: out['rule_template_index'].setdefault(rid,[]).append(tid)
    out['offer_display']={str(r['Template ID / Policy']):{'template':str(r['Template / Rule'])} for r in base.rows_by_header(wb['Offer Display Rules']) if r.get('Template ID / Policy') and str(r['Template ID / Policy']) in s.get('RENDER_POLICY_OFFER_DISPLAY_ID',set())}
    out['long_term_templates']={str(r['Template ID']):str(r['Template Text']) for r in base.rows_by_header(wb['Long-term Templates']) if str(r.get('Template ID') or '') in s.get('RENDER_POLICY_LONG_TERM_TEMPLATE_ID',set())}
    out['rule_variant_routing']={}
    for r in base.rows_by_header(wb['Rule Variant Routing']): out['rule_variant_routing'].setdefault(str(r['Rule ID']),[]).append({'state':str(r['State']),'priority':r['Priority'],'when':base.parse_json(r['Predicate JSON'])})
    for v in out['rule_variant_routing'].values(): v.sort(key=lambda x:-(x['priority'] or 0))
    out['rule_suppression']=[{'trigger_rule_id':str(r['Trigger Rule ID']),'suppress_rule_id':str(r['Suppress Rule ID'])} for r in base.rows_by_header(wb['Rule Suppression']) if r.get('Trigger Rule ID')]
    out['render_variable_bindings']={str(r['Variable']):{'source_type':str(r['Source Type']),'source_key':r.get('Source Key'),'format':r.get('Format'),'exclude_values':base.split_vars(r.get('Exclude Values'))} for r in base.rows_by_header(wb['Render Variable Bindings']) if r.get('Variable')}
    out['approval_render_policy']=[]
    for r in base.rows_by_header(wb['Approval Render Policy']): out['approval_render_policy'].append({'priority':r['Priority'],'template_id':str(r['Template ID']),'when':base.parse_json(r['Predicate JSON']),'reason_mode':str(r['Reason Mode']),'max_negative':int(r['Max Negative'] or 0),'max_positive':int(r['Max Positive'] or 0),'max_total':int(r['Max Total'] or 0),'append_soft_impact':bool(r['Append Soft Impact']),'missing_application_append':r.get('Missing Application Append')})
    out['approval_render_policy'].sort(key=lambda x:-(x['priority'] or 0))
    out['offer_render_routing']=[{'mode':str(r['Mode']),'priority':r['Priority'],'template_id':str(r['Template ID']),'when':base.parse_json(r['Predicate JSON'])} for r in base.rows_by_header(wb['Offer Render Routing']) if r.get('Template ID')]
    out['offer_render_routing'].sort(key=lambda x:(x['mode'],-(x['priority'] or 0)))
    out['offer_history_position']={str(r['Rating']):str(r['Sentence']) for r in base.rows_by_header(wb['Offer History Position']) if r.get('Rating')}
    out['long_term_render_routing']=[{'order':int(r['Order']),'segment':str(r['Segment']),'priority':r['Priority'],'template_id':str(r['Template ID']),'when':base.parse_json(r['Predicate JSON'])} for r in base.rows_by_header(wb['Long-term Render Routing']) if r.get('Template ID')]
    out['long_term_render_routing'].sort(key=lambda x:(x['order'],-(x['priority'] or 0)))
    return out


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--approval',type=Path,required=True);ap.add_argument('--long-term',type=Path,required=True);ap.add_argument('--orchestrator',type=Path,required=True);ap.add_argument('--registry',type=Path,required=True);ap.add_argument('--out-dir',type=Path,required=True);a=ap.parse_args();a.out_dir.mkdir(parents=True,exist_ok=True)
    outputs={'approval-config.json':base.export_approval(a.approval),'long-term.json':base.export_long_term(a.long_term,a.registry),'orchestrator.json':base.export_orchestrator(a.orchestrator),'report-templates.json':export_templates(a.registry),'report-render-policy.json':export_render_policy(a.registry)}
    for name,data in outputs.items():(a.out_dir/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'status':'PASS','files':list(outputs),'cards':len(outputs['long-term.json']['cards']),'report_rule_templates':len(outputs['report-templates.json']['rule_templates'])},ensure_ascii=False))
if __name__=='__main__':main()
