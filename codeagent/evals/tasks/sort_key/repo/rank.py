def ranking(users):
    return sorted(users, key=lambda u: u['score'])
