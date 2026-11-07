from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "db" / "imuni" / "schema.sql"
COMPOSE = ROOT / "docker-compose.imuni-postgres.dev.yml"


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


def test_schema_references_correct_practitioners_table():
    sql = SCHEMA.read_text(encoding="utf-8")
    assert "imuni.practitioners" in sql
    assert "imuni.practititioners" not in sql


def test_encounters_status_column_has_trailing_comma():
    sql = SCHEMA.read_text(encoding="utf-8")
    assert "status text not null default 'draft' check (status in ('draft','signed','amended','voided'))," in sql
    assert "status text not null default 'draft' check (status in ('draft','signed','amended','voided'))\n  chief_complaint_encrypted" not in sql


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


def test_postgres_compose_uses_external_secret_file_without_imuni_env_mismatch():
    compose = COMPOSE.read_text(encoding="utf-8")
    assert "/opt/api-dev-brain/config/imuni-postgres.env" in compose
    assert "IMUNI_POSTGRES_" not in compose
    # POSTGRES_USER/DB are allowed in postgres official containers health checks;
    # the secret guard must block password/DSN exposure or inline secret values.
    assert "POSTGRES_PASSWORD" not in compose
    assert "${POSTGRES_PASSWORD" not in compose
    assert "DATABASE_URL" not in compose
    assert "DN" not in compose.upper()
    assert "ports:" not in compose
    assert "expose:" in compose
    assert "internal: true" in compose
