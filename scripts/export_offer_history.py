"""Read-only XLSX export. Requires openpyxl; never evaluates Timing formulas."""
import argparse, collections, datetime as dt, hashlib, json, math, re
from pathlib import Path
import openpyxl
from openpyxl.utils.datetime import from_excel

ROOT = Path(__file__).resolve().parents[1]

def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def date_info(value, precision, epoch):
    if numeric(value):
        value = from_excel(value, epoch)
    if isinstance(value, str):
        try:
            value = dt.datetime.fromisoformat(value)
        except ValueError:
            return None
    if not isinstance(value, (dt.date, dt.datetime)):
        return None
    y, m, d = value.year, value.month, value.day
    if precision in ('DAY', 'EXACT'):
        return f'{y:04}-{m:02}-{d:02}', f'{y:04}-{m:02}-{d:02}'
    if precision in ('MONTH', 'EXACT_OR_MONTH', 'EXACT_END/MONTH_START'):
        return f'{y:04}-{m:02}-01', f'{y:04}-{m:02}'
    if precision == 'QUARTER':
        q = (m - 1) // 3 + 1
        return f'{y:04}-{3*q-2:02}-01', f'{y:04} Q{q}'
    if precision == 'YEAR':
        return f'{y:04}-01-01', str(y)
    return None

def export(source):
    w = openpyxl.load_workbook(source, data_only=True, read_only=True)
    warnings, products = [], {}
    def warn(sheet, row, oid, issue):
        warnings.append(dict(sheet=sheet, row=row, offer_timing_id=oid, issue=issue))
    def records(sheet):
        rows = w[sheet].iter_rows(values_only=True)
        header = next(rows)
        for n, values in enumerate(rows, 2):
            if any(v is not None for v in values):
                yield n, dict(zip(header, values))
    outputs = {r['Offer Timing ID']: r for _, r in records('Timing Output') if r.get('Offer Timing ID')}
    for n, r in records('Current Offer Input'):
        oid = r.get('Offer Timing ID')
        if not oid or oid in products:
            warn('Current Offer Input', n, oid, 'Missing or duplicate ID; record excluded')
            continue
        date = date_info(r.get('Evaluation Date'), 'DAY', w.epoch)
        c = dict(offer_label=r.get('Current Offer (Reference)'), comparable_value=r.get('Current Comparable Value'),
                 comparison_unit=r.get('Comparison Unit'), offer_mechanism=r.get('Offer Mechanism'),
                 evaluation_date=date[0] if date else None, source_row=n,
                 offer_rating=outputs.get(oid, {}).get('Offer Recommendation'),
                 wait_recommendation=outputs.get(oid, {}).get('Wait Recommendation'))
        c['display_eligible'] = bool(c['offer_label'] and numeric(c['comparable_value']) and c['comparison_unit'] and date and c['offer_mechanism'])
        if not c['display_eligible']:
            warn('Current Offer Input', n, oid, 'Missing/invalid required current fields; chart unavailable')
        if c['offer_rating'] is None or c['wait_recommendation'] is None:
            warn('Timing Output', n, oid, 'No cached formula output. Exported null; existing Assessment output remains authoritative, no recalculation.')
        products[oid] = dict(offer_timing_id=oid, issuer=r.get('Issuer'), card_name=r.get('Card Name'), card_type=r.get('Card Type'), current=c, history=[])
    for n, r in records('Offer History'):
        oid = r.get('Offer Timing ID')
        if oid not in products:
            warn('Offer History', n, oid, 'No matching current product; excluded from chart export')
            continue
        p = products[oid]
        reasons = []
        flag = r.get('Timing Eligible')
        if flag not in ('YES', 'NO'):
            reasons.append('Invalid Timing Eligible')
        elif flag != 'YES':
            reasons.append('Timing Eligible is not YES')
        if any(r.get(k) != p[v] for k, v in [('Issuer','issuer'),('Card Name','card_name'),('Card Type','card_type')]):
            reasons.append('Product fields do not match current product')
        if not numeric(r.get('Comparable Value')):
            reasons.append('Comparable Value is not a finite number')
        if not r.get('Comparison Unit') or r['Comparison Unit'] != p['current']['comparison_unit']:
            reasons.append('Missing or mismatched Comparison Unit')
        if r.get('Confidence') != 'HIGH':
            reasons.append('Confidence missing or not HIGH')
        if not r.get('Bonus'):
            reasons.append('Bonus label missing')
        date = date_info(r.get('Offer Date'), r.get('Date Precision'), w.epoch)
        if not date:
            reasons.append('Missing or unsupported/approximate date precision')
        research = ' '.join(str(r.get(k) or '') for k in ('Source Basis','Notes','Bonus'))
        if re.search(r'benchmark|research.only|仅研究|仅供研究', research, re.I):
            reasons.append('Benchmark/research-only record')
        if date and p['current']['evaluation_date'] and date[0] > p['current']['evaluation_date']:
            reasons.append('History later than current evaluation date')
        event = dict(source_row=n, date=date[0] if date else None, date_label=date[1] if date else None,
                     bonus_label=r.get('Bonus'), spend_requirement=r.get('Spend Requirement'), comparable_value=r.get('Comparable Value'),
                     comparison_unit=r.get('Comparison Unit'), timing_eligible=flag, date_precision=r.get('Date Precision'),
                     confidence=r.get('Confidence'), display_eligible=not reasons, exclusion_reasons=reasons, raw=r)
        p['history'].append(event)
        for reason in reasons:
            warn('Offer History', n, oid, reason)
    for oid, p in products.items():
        seen, dates = {}, collections.defaultdict(list)
        for e in p['history']:
            key = tuple(e.get(k) for k in ('date','date_precision','bonus_label','spend_requirement','comparable_value','comparison_unit'))
            if key in seen:
                e['display_eligible'] = False
                e['exclusion_reasons'].append(f'Duplicate of row {seen[key]}')
                warn('Offer History', e['source_row'], oid, e['exclusion_reasons'][-1])
            else:
                seen[key] = e['source_row']
            if e['display_eligible']:
                dates[e['date']].append(e)
        for date, events in dates.items():
            if len({e['comparable_value'] for e in events}) > 1:
                for e in events:
                    e['display_eligible'] = False
                    e['exclusion_reasons'].append('Conflicting values at same display date')
                    warn('Offer History', e['source_row'], oid, f'Conflicting values at {date}; all conflicting records excluded, no winner guessed')
            elif len(events) > 1:
                # Same position can share one SVG node with all source offers in its details.
                warn('Offer History', events[0]['source_row'], oid, f'Multiple labels at {date} share equal value; retained together')
        p['history'].sort(key=lambda e: (e['date'] or '', e['source_row']))
    w.close()
    return products, dict(source_file=Path(source).name, source_sha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                         product_count=len(products), history_count=sum(len(p['history']) for p in products.values()),
                         display_count=sum(e['display_eligible'] for p in products.values() for e in p['history']), warnings=warnings)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'data')
    args = parser.parse_args()
    products, report = export(args.source)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, value in [('offer-history.json', products), ('offer-history-validation.json', report)]:
        (args.output_dir/name).write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'warnings'}))
    print(f"Validation messages: {len(report['warnings'])}; inspect offer-history-validation.json before publishing.")

if __name__ == '__main__':
    main()
