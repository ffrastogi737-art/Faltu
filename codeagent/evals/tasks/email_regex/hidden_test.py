import unittest
from emails import is_valid_email as v
class H(unittest.TestCase):
    def test(self):
        self.assertTrue(v('x.y+z@mail.example.in'))
        self.assertFalse(v('a@b'))
        self.assertFalse(v('a b@c.com'))
        self.assertFalse(v('@c.com'))
