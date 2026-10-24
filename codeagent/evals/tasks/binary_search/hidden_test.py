import unittest
from search import find
class H(unittest.TestCase):
    def test(self):
        a = [1, 3, 5, 7, 9]
        for i, x in enumerate(a):
            self.assertEqual(find(a, x), i)
        self.assertEqual(find(a, 4), -1)
        self.assertEqual(find([], 1), -1)
