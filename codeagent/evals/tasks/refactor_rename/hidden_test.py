import unittest, billing
from report import line
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(billing.calculate_total([10, 20], 0.1), 33.0)
        self.assertEqual(line([10]), 'total: 11.0')
        self.assertFalse(hasattr(billing, 'calc'))
