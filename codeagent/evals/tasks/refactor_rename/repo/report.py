from billing import calc


def line(prices):
    return f'total: {calc(prices, 0.1)}'
