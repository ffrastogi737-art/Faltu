def parse_config(text):
    out = {}
    for line in text.splitlines():
        k, v = line.split('=')
        out[k] = v
    return out
