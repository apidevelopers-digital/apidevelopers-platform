import unittest
from types import SimpleNamespace
from python.entrypoint_hook import register_alexa_descriptions, dispatch_alexa, AlexaNotConfigured

class Reader:
    def list_skills(self, *, vendor_id, max_results): return {"skills": [], "max": max_results}
    def get_manifest(self, *, skill_id, stage): return {"manifest": {"stage": stage}}

class HookTest(unittest.TestCase):
    def test_unconfigured_catalog_is_unchanged(self):
        cat = {"tools": [{"name": "storage.status"}], "count": 1}
        self.assertIs(register_alexa_descriptions(cat), cat)
    def test_unconfigured_call_fails_closed(self):
        with self.assertRaisesRegex(AlexaNotConfigured, "reader_unavailable"):
            dispatch_alexa("alexa.skills.list", {"vendorId": "AMZN"})
    def test_configured_catalog_adds_two_non_destructively(self):
        cat={"tools":[{"name":"storage.status"}],"count":1}
        out=register_alexa_descriptions(cat,reader=Reader())
        self.assertEqual(out["count"],3)
        self.assertEqual(cat["count"],1)
        self.assertEqual(len(cat["tools"]),1)
    def test_catalog_idempotent(self):
        a=register_alexa_descriptions({"tools":[]},reader=Reader())
        b=register_alexa_descriptions(a,reader=Reader())
        self.assertEqual(len(b["tools"]),2)
    def test_enabled_routes_only_getters(self):
        result=dispatch_alexa("alexa.skills.list",{"vendorId":"AMZN"},reader=Reader())
        self.assertTrue(result["ok"])
        self.assertFalse(result["would_execute"])
    def test_disallows_unrecognized_action(self):
        with self.assertRaisesRegex(ValueError,"not_supported"):
            dispatch_alexa("alexa.skills.delete",{},reader=Reader())
    def test_incomplete_reader_not_usable(self):
        with self.assertRaises(AlexaNotConfigured):
            register_alexa_descriptions({"tools":[]},reader=SimpleNamespace(list_skills=lambda:None))
    def test_argument_token_injection_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_args"):
            dispatch_alexa("alexa.skills.list",{"vendorId":"AMZN","token":"x"},reader=Reader())
