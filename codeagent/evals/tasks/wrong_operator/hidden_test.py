import unittest
from people import is_adult
class H(unittest.TestCase):
    def test(self):
        self.assertTrue(is_adult(18))
        self.assertFalse(is_adult(17))
        self.assertTrue(is_adult(40))
