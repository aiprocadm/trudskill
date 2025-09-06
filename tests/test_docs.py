import sys
from pathlib import Path
import pytest

# Ensure project root is on PYTHONPATH when tests executed from other directories
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.docs import generator, exporters


def test_generate_certificate_docx(tmp_path):
    pytest.importorskip("docx")
    pytest.importorskip("reportlab")
    path = tmp_path / "cert.docx"
    generator.generate_certificate_docx({
        "name": "Иван Иванов",
        "course": "Python",
        "date": "2024-01-01"
    }, path)
    assert path.exists()


def test_generate_frdo_excel(tmp_path):
    pytest.importorskip("openpyxl")
    path = tmp_path / "frdo.xlsx"
    exporters.generate_frdo_excel([
        {"number": "1", "name": "Иван", "date": "2024-01-01"}
    ], path)
    assert path.exists()


def test_generate_eisot_xml():
    xml_bytes = exporters.generate_eisot_xml([
        {"number": "1", "name": "Иван", "date": "2024-01-01"}
    ])
    text = xml_bytes.decode("utf-8")
    assert "<records>" in text
    assert "<record>" in text
    assert "<name>Иван</name>" in text


def test_validate_record_missing():
    with pytest.raises(ValueError):
        exporters.validate_record({"name": "А"})
