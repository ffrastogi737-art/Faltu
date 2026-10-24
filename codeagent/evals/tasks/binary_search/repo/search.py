def find(items, x):
    lo, hi = 0, len(items) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if items[mid] == x:
            return mid
        if items[mid] < x:
            lo = mid
        else:
            hi = mid - 1
    return -1
