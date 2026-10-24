import unittest
from conv import safe_int
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(safe_int(' 42 '), 42)
        self.assertIsNone(safe_int('4x'))
        self.assertEqual(safe_int(None, 0), 0)
