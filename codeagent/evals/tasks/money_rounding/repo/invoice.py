def invoice_total(lines):
    return sum(qty * price for qty, price in lines)
