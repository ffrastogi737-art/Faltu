import unittest
from tags import add_tag
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(add_tag('x'), ['x'])
        self.assertEqual(add_tag('x'), ['x'])
        self.assertEqual(add_tag('y', ['a']), ['a', 'y'])
