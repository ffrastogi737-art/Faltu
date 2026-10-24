import re


def is_valid_email(s):
    return re.match(r'.+@.+', s) is not None
