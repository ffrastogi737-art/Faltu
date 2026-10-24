import unittest
from rank import ranking
class H(unittest.TestCase):
    def test(self):
        u = [{'name': 'b', 'score': 5}, {'name': 'a', 'score': 5}, {'name': 'c', 'score': 9}]
        self.assertEqual([x['name'] for x in ranking(u)], ['c', 'a', 'b'])
