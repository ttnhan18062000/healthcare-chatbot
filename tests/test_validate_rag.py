import unittest

from validate_rag import validate_response


class ValidateRagResponseTest(unittest.TestCase):
    def test_does_not_require_citations_for_a_non_retrieval_response(self):
        result = validate_response(
            actual="Mình có thể hỗ trợ các câu hỏi về sa sút trí tuệ và chăm sóc người thân tại nhà.",
            expected="",
            sample={},
            latency=0.1,
            used_document_search=False,
        )

        self.assertEqual(result["metrics"]["citation_markers"], "Not applicable")
        self.assertEqual(result["metrics"]["source_footer"], "Not applicable")


if __name__ == "__main__":
    unittest.main()
