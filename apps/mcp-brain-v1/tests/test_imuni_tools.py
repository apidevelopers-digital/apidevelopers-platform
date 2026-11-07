from app.tools.imuni_tools import call_imuni_tool


def test_red_flags_negated_list():
    response = call_imuni_tool(
        "imuni.red_flags.check",
        {
            "age_group": "adulto",
            "text": (
                "Paciente adulto relata febre há 2 dias, tosse seca, dor no corpo e cansaço. "
                "Nega falta de ar, dor no peito, desmaio, confusão, sangramento intenso ou rigidez de nuca."
            ),
        },
    )
    payload = response["result"]

    assert payload["detected_red_flags"] == []
    assert payload["urgent_human_review_required"] is False
    assert payload["negation_patch_version"] == "v3-clause-scoped"

    terms = {item["term"] for item in payload["negated_red_flags"]}
    assert {"falta de ar", "dor no peito", "desmaio", "confusão", "sangramento intenso", "rigidez de nuca"} <= terms


def test_red_flags_positive_when_not_negated():
    response = call_imuni_tool(
        "imuni.red_flags.check",
        {"age_group": "adulto", "text": "Paciente relata falta de ar e dor no peito."},
    )
    payload = response["result"]

    terms = {item["term"] for item in payload["detected_red_flags"]}
    assert {"falta de ar", "dor no peito"} <= terms
    assert payload["urgent_human_review_required"] is True


def test_red_flags_mixed_negation_does_not_suppress_positive_clause():
    response = call_imuni_tool(
        "imuni.red_flags.check",
        {"age_group": "adulto", "text": "Nega falta de ar, mas apresenta dor no peito."},
    )
    payload = response["result"]

    detected = {item["term"] for item in payload["detected_red_flags"]}
    negated = {item["term"] for item in payload["negated_red_flags"]}

    assert "falta de ar" in negated
    assert "dor no peito" in detected
    assert payload["urgent_human_review_required"] is True
