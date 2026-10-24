MEMBER_DISCOUNT = 0.10


class Item:
    def __init__(self, price):
        self.price = price

    def member_price(self):
        return self.price * (1 - MEMBER_DISCOUNT)
