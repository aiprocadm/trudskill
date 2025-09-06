"""Export utilities for FIS FRDO (Excel) and EISOT (XML)."""
from pathlib import Path
from typing import Iterable, Dict
from xml.etree.ElementTree import Element, SubElement, tostring

try:  # pragma: no cover - optional dependency
    from openpyxl import Workbook
except Exception:  # pragma: no cover
    Workbook = None


REQUIRED_FIELDS = {"number", "name", "date"}


def validate_record(record: Dict[str, str]) -> None:
    missing = REQUIRED_FIELDS - record.keys()
    if missing:
        raise ValueError(f"Missing fields: {', '.join(sorted(missing))}")


def generate_frdo_excel(records: Iterable[Dict[str, str]], output_path: Path) -> Path:
    """Generate an Excel workbook compatible with FIS FRDO."""
    if Workbook is None:
        raise RuntimeError("openpyxl is required for Excel export")
    wb = Workbook()
    ws = wb.active
    ws.append(sorted(REQUIRED_FIELDS))
    for rec in records:
        validate_record(rec)
        ws.append([rec[field] for field in sorted(REQUIRED_FIELDS)])
    wb.save(output_path)
    return output_path


def generate_eisot_xml(records: Iterable[Dict[str, str]]) -> bytes:
    """Generate an XML string compatible with EISOT."""
    root = Element("records")
    for rec in records:
        validate_record(rec)
        rec_el = SubElement(root, "record")
        for field in sorted(REQUIRED_FIELDS):
            child = SubElement(rec_el, field)
            child.text = str(rec[field])
    return tostring(root, encoding="utf-8")
