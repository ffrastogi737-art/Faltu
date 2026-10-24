import unittest
from mathx import factorial
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(factorial(0), 1)
        self.assertEqual(factorial(5), 120)
        with self.assertRaises(ValueError):
            factorial(-1)
