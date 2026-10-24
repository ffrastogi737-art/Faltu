import unittest
from stats import average
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(average([1, 2]), 1.5)
        self.assertEqual(average([]), 0.0)
