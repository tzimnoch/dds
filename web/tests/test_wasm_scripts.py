import os
import shutil
import tempfile
import unittest
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parents[1]


class DummyTest(unittest.TestCase):
    def test_placeholder(self) -> None:
        self.assertTrue(True)
