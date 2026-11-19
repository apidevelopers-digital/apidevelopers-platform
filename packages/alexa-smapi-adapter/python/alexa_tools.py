"""Read-only Alexa MCP bridge, to be mounted by the approved FastAPI app."""
TOOLS = ({"name":"alexa.skills.list","risk":"R1","mode":"read","description":"List authorized Alexa skills"},
         {"name":"alexa.skills.manifest","risk":"R1","mode":"read","description":"Read authorized skill manifest"})
def tool_descriptions():
    return [dict(x) for x in TOOLS]
def call_alexa_tool(name, arguments=None, client=None):
    if name not in {t["name"] for t in TOOLS}: raise ValueError("tool_not_allowed")
    if not isinstance(arguments,dict): raise ValueError("invalid_arguments")
    if client is None:
        return {"ok":False,"status":"oauth_not_configured","would_execute":False}
    if name == "alexa.skills.list":
        if set(arguments)-{"vendorId","maxResults"}: raise ValueError("invalid_arguments")
        vendor=arguments.get("vendorId")
        if not isinstance(vendor,str) or not vendor.isalnum(): raise ValueError("invalid_vendor")
        return {"ok":True,"result":client.list_skills(vendor)}
    if set(arguments)-{"skillId","stage"}: raise ValueError("invalid_arguments")
    skill=arguments.get("skillId")
    stage=arguments.get("stage","development")
    if not isinstance(skill,str) or not skill.startswith("amzn1.ask.skill.") or stage not in {"development","live"}:
        raise ValueError("invalid_skill")
    return {"ok":True,"result":client.get_manifest(skill,stage)}
