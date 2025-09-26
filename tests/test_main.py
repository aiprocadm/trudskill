from pathlib import Path
import sys

# Ensure the src package is on the Python path
sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.main import generate_greeting


def test_generate_greeting() -> None:
    assert generate_greeting("Tester") == "Hello, Tester!"
