"""Read-only Alexa MCP tool definitions; backend binding pending."""
TOOL_NAMES = ("alexa.skills.list", "alexa.skills.manifest")

def tool_descriptions():
    return [{"name": n, "risk": "R1", "mode": "read", "category": "alexa"}
            for n in TOOL_NAMES]

def call_alexa_tool(tool, args, reader):
    if tool not in TOOL_NAMES:
        raise ValueError("alexa_unknown_tool")
    if not isinstance(args, dict):
        raise ValueError("alexa_invalid_args")
    if tool == "alexa.skills.list":
        if set(args) - {"vendorId", "maxResults"}:
            raise ValueError("alexa_invalid_args")
        vendor = args.get("vendorId")
        limit = args.get("maxResults", 20)
        if not isinstance(vendor, str) or not vendor.isalnum() or len(vendor) > 120:
            raise ValueError("alexa_invalid_vendor")
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError("alexa_invalid_limit")
        value = reader.list_skills(vendor_id=vendor, max_results=limit)
    else:
        if set(args) - {"skillId", "stage"}:
            raise ValueError("alexa_invalid_args")
        skill = args.get("skillId")
        stage = args.get("stage", "development")
        if not isinstance(skill, str) or not skill.startswith("amzn1.ask.skill.") or len(skill) > 180:
            raise ValueErrror("alexa_invalid_skill")
        if stage not in ("development", "live"):
            raise ValueError("alexa_invalid_stage")
        value = reader.get_manifest(skill_id=skill, stage=stage)
    if not isinstance(value, dict):
        raise ValueError("alexa_invalid_result")
    return {"ok": True, "tool": tool, "result": value, "would_execute": False, "filesystem_write": False}
