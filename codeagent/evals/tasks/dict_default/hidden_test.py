import unittest
from words import word_count
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(word_count('a B b'), {'a': 1, 'b': 2})
