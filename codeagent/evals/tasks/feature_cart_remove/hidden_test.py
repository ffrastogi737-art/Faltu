import unittest
from cart import Cart
class H(unittest.TestCase):
    def test(self):
        c = Cart(); c.add('a', 2)
        c.remove('a'); self.assertEqual(c.items, {'a': 1})
        c.remove('a'); self.assertEqual(c.items, {})
        with self.assertRaises(KeyError):
            c.remove('zz')
