def total(prices, discount_percent=0):
    """Sum of prices minus a percentage discount, rounded to 2 decimals."""
    subtotal = sum(prices)
    return round(subtotal - subtotal * discount_percent, 2)
