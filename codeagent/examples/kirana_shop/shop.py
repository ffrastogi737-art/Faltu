"""A tiny kirana (grocery) shop: stock, bill with GST and a coupon."""

STOCK = {"rice": 10, "dal": 5, "sugar": 8}
PRICES = {"rice": 60.0, "dal": 120.0, "sugar": 45.0}
GST_PERCENT = 5
COUPON_MIN_BILL = 500  # coupon works only when the bill is at least this much
COUPON_OFF = 50


def sell(item, qty):
    """Take qty units out of stock and return the line amount."""
    if item not in STOCK:
        raise KeyError(f"unknown item: {item}")
    STOCK[item] -= qty
    return PRICES[item] * qty


def with_gst(amount):
    return round(amount + amount * GST_PERCENT, 2)


def apply_coupon(amount):
    if amount > COUPON_MIN_BILL:
        return amount - COUPON_OFF
    return amount


def bill(cart, coupon=False):
    """cart: {item: qty}. Returns the final amount to pay."""
    subtotal = sum(sell(item, qty) for item, qty in cart.items())
    if coupon:
        subtotal = apply_coupon(subtotal)
    return with_gst(subtotal)
