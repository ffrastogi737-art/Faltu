import subprocess, sys, unittest
class H(unittest.TestCase):
    def run_(self, *a):
        return subprocess.run([sys.executable, 'greet.py', *a], capture_output=True, text=True).stdout.strip()
    def test(self):
        self.assertEqual(self.run_('Ana'), 'Hello, Ana!')
        self.assertEqual(self.run_('Ana', '--upper'), 'HELLO, ANA!')
