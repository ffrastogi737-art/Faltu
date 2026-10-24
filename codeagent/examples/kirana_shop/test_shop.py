import unittest

import shop


class Shop(unittest.TestCase):
    def setUp(self):
        shop.STOCK.update({"rice": 10, "dal": 5, "sugar": 8})

    def test_gst_is_five_percent(self):
        self.assertEqual(shop.with_gst(100), 105.0)

    def test_coupon_at_exact_minimum(self):
        self.assertEqual(shop.apply_coupon(500), 450)
        self.assertEqual(shop.apply_coupon(499), 499)

    def test_cannot_sell_more_than_stock(self):
        with self.assertRaises(ValueError):
            shop.sell("dal", 6)
        self.assertEqual(shop.STOCK["dal"], 5)  # stock unchanged after a failed sale

    def test_full_bill(self):
        # 5 rice (300) + 2 dal (240) = 540, coupon -50 = 490, +5% GST = 514.5
        self.assertEqual(shop.bill({"rice": 5, "dal": 2}, coupon=True), 514.5)


if __name__ == "__main__":
    unittest.main()
