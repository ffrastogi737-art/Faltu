import os
import re
import unittest

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APIS = {"openai", "gemini", "cohere", "ai21", "cloudflare", "horde"}
STATUSES = {"live", "paid-only", "dead", "unclear", "unverified"}


class ProvidersYaml(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT, "providers.yaml")) as f:
            self.providers = yaml.safe_load(f)["providers"]

    def test_fields(self):
        for name, p in self.providers.items():
            with self.subTest(name):
                self.assertIn(p["api"], APIS)
                self.assertIn(p["status"], STATUSES)
                self.assertRegex(p["key_env"], r"^[A-Z][A-Z0-9_]*$")
                self.assertIsInstance(p["allow_private_code"], bool)
                if not p["enabled"]:
                    self.assertTrue(p.get("reason"), "disabled provider needs a reason")
                else:
                    self.assertTrue(p["base_url"].startswith("https://"))

    def test_horde_never_private(self):
        self.assertFalse(self.providers["ai_horde"]["allow_private_code"])

    def test_every_key_env_in_env_example(self):
        with open(os.path.join(ROOT, ".env.example")) as f:
            names = set(re.findall(r"^([A-Z0-9_]+)=$", f.read(), re.M))
        for p in self.providers.values():
            self.assertIn(p["key_env"], names)
        # placeholders in base_url must also be declared
        for p in self.providers.values():
            for var in re.findall(r"\{([A-Z0-9_]+)\}", p["base_url"]):
                self.assertIn(var, names)

    def test_no_secrets_in_repo_files(self):
        # .env.example must hold names only, never values
        with open(os.path.join(ROOT, ".env.example")) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    self.assertEqual(line.split("=", 1)[1].strip(), "")


if __name__ == "__main__":
    unittest.main()
