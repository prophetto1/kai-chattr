import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.proposals.patch_kernel import apply_text_patch


class ProposalPatchKernelTests(unittest.TestCase):
    def test_content_hunks_apply_in_declaration_order(self):
        result = apply_text_patch(
            "alpha beta\nremove me\n",
            [
                {"search": "beta", "replace": "BETA"},
                {"mode": "delete", "search": "remove me\n"},
            ],
        )

        self.assertEqual(result, {"ok": True, "content": "alpha BETA\n", "applied": 2})

    def test_ambiguous_search_fails_without_replace_all(self):
        result = apply_text_patch(
            "same\nsame\n",
            [{"search": "same", "replace": "changed"}],
        )

        self.assertEqual(
            result,
            {
                "ok": False,
                "error": {"code": "HUNK_AMBIGUOUS", "hunkIndex": 0, "occurrences": 2},
            },
        )

    def test_replace_all_updates_every_occurrence(self):
        result = apply_text_patch(
            "same\nsame\n",
            [{"search": "same", "replace": "changed", "replaceAll": True}],
        )

        self.assertEqual(
            result,
            {"ok": True, "content": "changed\nchanged\n", "applied": 2},
        )

    def test_content_hunks_apply_before_line_hunks_and_preserve_trailing_newline(self):
        result = apply_text_patch(
            "alpha\nbeta\n",
            [
                {"search": "beta", "replace": "BETA"},
                {
                    "mode": "replaceLines",
                    "startLine": 2,
                    "endLine": 2,
                    "content": "line two",
                },
            ],
        )

        self.assertEqual(
            result,
            {"ok": True, "content": "alpha\nline two\n", "applied": 2},
        )

    def test_line_hunks_validate_against_baseline_and_apply_bottom_up(self):
        result = apply_text_patch(
            "L1\nL2\nL3\nL4\n",
            [
                {"mode": "deleteLines", "startLine": 2, "endLine": 2},
                {"mode": "insertAt", "line": 4, "content": "INS"},
            ],
        )

        self.assertEqual(
            result,
            {"ok": True, "content": "L1\nL3\nINS\nL4\n", "applied": 2},
        )

    def test_line_hunks_that_touch_are_rejected(self):
        result = apply_text_patch(
            "L1\nL2\nL3\nL4\n",
            [
                {"mode": "deleteLines", "startLine": 2, "endLine": 3},
                {"mode": "insertAt", "line": 3, "content": "INS"},
            ],
        )

        self.assertEqual(
            result,
            {"ok": False, "error": {"code": "LINE_OVERLAP", "hunkIndex": 1}},
        )

    def test_empty_hunks_fail(self):
        self.assertEqual(
            apply_text_patch("source", []),
            {"ok": False, "error": {"code": "EMPTY_HUNKS", "hunkIndex": -1}},
        )

    def test_empty_search_fails(self):
        self.assertEqual(
            apply_text_patch("source", [{"search": "", "replace": "x"}]),
            {"ok": False, "error": {"code": "EMPTY_SEARCH", "hunkIndex": 0}},
        )

    def test_missing_search_fails(self):
        self.assertEqual(
            apply_text_patch("source", [{"search": "missing", "replace": "x"}]),
            {
                "ok": False,
                "error": {"code": "HUNK_NOT_FOUND", "hunkIndex": 0, "search": "missing"},
            },
        )

    def test_invalid_line_range_fails_before_overlap_checks(self):
        result = apply_text_patch(
            "L1\nL2\n",
            [
                {"mode": "deleteLines", "startLine": 2, "endLine": 1},
                {"mode": "insertAt", "line": 2, "content": "INS"},
            ],
        )

        self.assertEqual(
            result,
            {"ok": False, "error": {"code": "INVALID_LINE_RANGE", "hunkIndex": 0}},
        )

    def test_line_out_of_range_fails(self):
        result = apply_text_patch(
            "L1\nL2\n",
            [{"mode": "insertAt", "line": 4, "content": "INS"}],
        )

        self.assertEqual(
            result,
            {
                "ok": False,
                "error": {
                    "code": "LINE_OUT_OF_RANGE",
                    "hunkIndex": 0,
                    "line": 4,
                    "totalLines": 2,
                },
            },
        )

    def test_missing_insert_line_fails_without_crashing(self):
        result = apply_text_patch(
            "L1\nL2\n",
            [{"mode": "insertAt", "content": "INS"}],
        )

        self.assertEqual(
            result,
            {
                "ok": False,
                "error": {
                    "code": "LINE_OUT_OF_RANGE",
                    "hunkIndex": 0,
                    "line": None,
                    "totalLines": 2,
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
