import unittest
from invoice import invoice_total
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(invoice_total([(1, 0.1), (2, 0.1)]), 0.3)
        self.assertEqual(invoice_total([(3, 19.99)]), 59.97)
