def word_count(text):
    counts = {}
    for w in text.split():
        counts[w] += 1
    return counts
