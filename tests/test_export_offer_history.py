import importlib.util, unittest, datetime as dt, tempfile, json
from pathlib import Path
from openpyxl.utils.datetime import WINDOWS_EPOCH
spec=importlib.util.spec_from_file_location('exporter',Path(__file__).resolve().parents[1]/'scripts/export_offer_history.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class ExportTests(unittest.TestCase):
    def test_date_precision(self):
        d=dt.datetime(2025,5,17)
        for p,expected in [('DAY',('2025-05-17','2025-05-17')),('EXACT',('2025-05-17','2025-05-17')),('MONTH',('2025-05-01','2025-05')),('EXACT_OR_MONTH',('2025-05-01','2025-05')),('EXACT_END/MONTH_START',('2025-05-01','2025-05')),('QUARTER',('2025-04-01','2025 Q2')),('YEAR',('2025-01-01','2025'))]:
            self.assertEqual(mod.date_info(d,p,WINDOWS_EPOCH),expected)
        self.assertIsNone(mod.date_info(d,'APPROX',WINDOWS_EPOCH))
        self.assertIsNone(mod.date_info(None,'MONTH',WINDOWS_EPOCH))
    def test_numeric(self):
        for n in [0,1200,1100.5]:self.assertTrue(mod.numeric(n))
        for n in [None,'1200',True,float('nan'),float('inf')]:self.assertFalse(mod.numeric(n))
    def test_exported_contract(self):
        data=json.loads((Path(__file__).resolve().parents[1]/'data/offer-history.json').read_text(encoding='utf8'))
        for oid,p in data.items():
            self.assertEqual(oid,p['offer_timing_id'])
            for e in p['history']:
                if e['display_eligible']:
                    self.assertEqual(e['timing_eligible'],'YES');self.assertEqual(e['confidence'],'HIGH')
                    self.assertEqual(e['comparison_unit'],p['current']['comparison_unit'])
                    self.assertTrue(mod.numeric(e['comparable_value']));self.assertTrue(e['date']);self.assertTrue(e['bonus_label'])
                    self.assertFalse(e['exclusion_reasons'])

if __name__=='__main__': unittest.main()
