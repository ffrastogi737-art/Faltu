import time, unittest
from dedupe import dedupe
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(dedupe([3, 1, 3, 2, 1]), [3, 1, 2])
        data = list(range(20000)) * 2
        t = time.time(); r = dedupe(data)
        self.assertEqual(len(r), 20000)
        self.assertLess(time.time() - t, 1.0)
