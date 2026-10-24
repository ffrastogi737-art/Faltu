import unittest
from names import full_name
class H(unittest.TestCase):
    def test(self):
        self.assertEqual(full_name('Asha ', ' Rao'), 'Asha Rao')
        self.assertEqual(full_name('Asha', None), 'Asha')
        self.assertEqual(full_name('Asha', ''), 'Asha')
