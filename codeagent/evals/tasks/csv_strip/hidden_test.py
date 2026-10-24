import unittest
from rows import parse_row
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(parse_row('a, b ,c\n'), ['a', 'b', 'c'])
