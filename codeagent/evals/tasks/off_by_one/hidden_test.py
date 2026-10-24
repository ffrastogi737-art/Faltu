import unittest
from lists import last_n
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(last_n([1, 2, 3, 4], 2), [3, 4])
        self.assertEqual(last_n([1, 2], 0), [])
        self.assertEqual(last_n([1, 2], 5), [1, 2])
