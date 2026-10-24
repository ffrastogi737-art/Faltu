import unittest

from agent.cli import FONT, NAME, banner, welcome


class Welcome(unittest.TestCase):
    def test_banner_shape(self):
        art = banner(lambda s, *_: s)
        self.assertEqual(len(art), 6)  # 5 letter rows + shadow row
        self.assertLessEqual(max(map(len, art)), 44)  # fits a portrait phone
        self.assertTrue(all(ch in FONT for ch in NAME))

    def test_plain_output_has_no_escape_codes(self):
        # stdout is not a tty under unittest, so colors must be off
        text = welcome()
        self.assertNotIn("\033[", text)
        self.assertIn("Efficient Developer Interface for Tech & Hacks", text)


if __name__ == "__main__":
    unittest.main()
