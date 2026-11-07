from pathlib import Path


SCHEMA = Path(__file__).resolve().parents[1] / "db" / "imuni" / "schema.sql"


def test_schema_file_exists():
    assert SCHEMA.exists()


def test_schema_uses_encrypted_clinical_fields():
    sql = SCHEMA.read_text(encoding="utf-8")
    required = [
        "full_name_encrypted",
        "subjective_encrypted",
        "objective_encrypted",
        "assessment_encrypted",
        "plan_encrypted",
        "body_encrypted",
    ]
    for item in required:
        assert item in sql


def test_audit_table_blocks_raw_clinical_payload():
    sql = SCHEMA.read_text(encoding="utf-8")
    assert "imuni_audit.events" in sql
    assert "no_raw_clinical_payload" in sql
    assert "raw_clinical_text" in sql
    assert "metadata_json ? 'subjective' = false" in sql


def test_row_level_security_enabled():
    sql = SCHEMA.read_text(encoding="utf-8").lower()
    assert sql.count("enable row level security") >= 8


def test_no_plaintext_clinical_body_columns():
    sql = SCHEMA.read_text(encoding="utf-8").lower()
    forbidden_patterns = [
        " body text",
        " subjective text",
        " objective text",
        " assessment text",
        " plan text",
        " full_name text",
    ]
    for pattern in forbidden_patterns:
        assert pattern not in sql