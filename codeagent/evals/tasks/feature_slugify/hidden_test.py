import unittest
from text_utils import slugify, shout
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(slugify(' Hello, World! 2026 '), 'hello-world-2026')
        self.assertEqual(slugify('--a  b--'), 'a-b')
        self.assertEqual(shout('a'), 'A')
