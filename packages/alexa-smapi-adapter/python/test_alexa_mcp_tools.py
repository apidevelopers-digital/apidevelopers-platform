import unittest
from alexa_mcp_tools import call_alexa_tool, tool_descriptions

class Reader:
    def list_skills(self, **kwargs): return {"skills": []}
    def get_manifest(self, **kwargs): return {"manifest": {}}

class TestMcpBridge(unittest.TestCase):
    def setUp(self): self.reader = Reader()
    def test_tools(self): self.assertEqual(len(tool_descriptions()), 2)
    def test_list(self):
        self.assertTrue(call_alexa_tool("alexa.skills.list", {"vendorId":"ABC"}, self.reader)["ok"])
    def test_manifest(self):
        self.assertTrue(call_alexa_tool("alexa.skills.manifest", {"skillId":"amzn1.ask.skill.123"}, self.reader)["ok"])
    def test_unknown(self):
        with self.assertRaises(ValueError):
            call_alexa_tool("alexa.skills.publish", {}, self.reader)
    def test_token_injection(self):
        with self.assertRaises(ValueError):
            call_alexa_tool("alexa.skills.list", {"vendorId":"ABC", "token":"secret"}, self.reader)
    def test_bad_limit(self):
        with self.assertRaises(ValueError):
            call_alexa_tool("alexa.skills.list", {"vendorId":"ABC", "maxResults":True}, self.reader)

if __name__ == "__main__": unittest.main()
