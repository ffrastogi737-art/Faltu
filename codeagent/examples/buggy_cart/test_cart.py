import unittest

from cart import total


class Total(unittest.TestCase):
    def test_no_discount(self):
        self.assertEqual(total([10, 5.5]), 15.5)

    def test_ten_percent(self):
        self.assertEqual(total([100, 50], 10), 135.0)


if __name__ == "__main__":
    unittest.main()
