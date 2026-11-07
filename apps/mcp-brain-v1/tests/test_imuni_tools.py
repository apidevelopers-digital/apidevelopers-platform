from app.tools.imuni_tools import call_imuni_tool


def test_red_flags_negated_list():
    result = call_imuni_tool(
        "imuni.red_flags.check",
        {
            "age_group": "adulto",
            "text": (
                "Paciente adulto relata febre há 2 dias, tosse seca, dor no corpo e cansaço. "
                "Nega falta de ar, dor no peito, desmaio, confusão, sangramento intenso ou rigidez de nuca."
            ),
        },
    )["result"]

    assert result["result"]["detected_red_flags"] == []
    assert result["result"]["urgent_human_review_required"] is False
    assert result["result"]["negation_patch_version"] == "v2"
    terms = {item["term"] for item in result["result"]["negated_red_flags"]}
    assert {"falta de ar", "dor no peito", "desmaio", "confusão", "sangramento intenso", "rigidez de nuca"} <= terms


def test_red_flags_positive_when_not_negated():
    result = call_imuni_tool(
        "imuni.red_flags.check",
        {"age_group": "adulto", "text": "Paciente relata falta de ar e dor no peito."},
    )["result"]

    terms = {item["term"] for item in result["result"]["detected_red_flags"]}
    assert {"falta de ar", "dor no peito"} <= terms
    assert result["result"]["urgent_human_review_required"] is True
