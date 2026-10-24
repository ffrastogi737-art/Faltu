import unittest
from conf import parse_config
class H(unittest.TestCase):
    def test(self):
        t = '# db\nhost = x\n\nurl=a=b\n  # end\n'
        self.assertEqual(parse_config(t), {'host': 'x', 'url': 'a=b'})
