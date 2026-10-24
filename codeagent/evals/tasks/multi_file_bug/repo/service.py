from models import MEMBER_DISCOUNT


def order_total(items, member=False):
    if member:
        total = sum(i.member_price() for i in items)
        return round(total * (1 - MEMBER_DISCOUNT), 2)
    return round(sum(i.price for i in items), 2)
