from __future__ import annotations

from typing import Any

from .imuni_base_tools import base_result


def _blocked(tool: str, reason: str) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": reason,
        "would_execute": False,
        "executed": False,
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": False,
        "raw_patient_data_returned": False,
        "hard_delete": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
    })


def call_patient_sql_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    """Safe placeholder while reviewed SQL transport is split into smaller modules.

    The MCP catalog keeps the REAL patient tools visible through imuni_patient_tools,
    but this module does not persist or mutate patient data until the reviewed
    transport implementation lands.
    """
    return _blocked(
        tool,
        "real patient SQL transport is parked pending split reviewed implementation.",
    )
