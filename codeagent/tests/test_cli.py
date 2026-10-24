import os
import unittest

from agent.cli import FONT, NAME, banner, welcome


class Welcome(unittest.TestCase):
    def test_banner_shape(self):
        art = banner(lambda s, *_: s)
        self.assertEqual(len(art), 6)  # 5 letter rows + shadow row
        self.assertLessEqual(max(map(len, art)), 44)  # fits a portrait phone
        self.assertTrue(all(ch in FONT for ch in NAME))

    def test_plain_output_has_no_escape_codes(self):
        os.environ["NO_COLOR"] = "1"  # a real terminal (Termux) would otherwise get colors
        self.addCleanup(os.environ.pop, "NO_COLOR")
        text = welcome()
        self.assertNotIn("\033[", text)
        self.assertIn("Tech & Hacks", text)  # box may wrap the full name


if __name__ == "__main__":
    unittest.main()
