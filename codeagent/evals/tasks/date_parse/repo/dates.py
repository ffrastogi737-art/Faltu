import datetime

def parse_date(s):
    m, d, y = s.split('/')
    return datetime.date(int(y), int(m), int(d))
