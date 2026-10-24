import datetime, unittest
from dates import parse_date
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(parse_date('25/12/2026'), datetime.date(2026, 12, 25))
