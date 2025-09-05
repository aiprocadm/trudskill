import subprocess
import sys
from pathlib import Path

def test_main_outputs_greeting():
    result = subprocess.run([sys.executable, str(Path("src") / "main.py")], capture_output=True, text=True, check=True)
    assert "Hello, world!" in result.stdout

