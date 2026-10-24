import unittest
from models import Item
from service import order_total
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(order_total([Item(100)], member=True), 90.0)
        self.assertEqual(order_total([Item(100)]), 100.0)
