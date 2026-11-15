"""Merge data/ib-choices/out/*.json (one file per question) into one array for import-ib-choices.mjs.
Usage: python scripts/merge-ib-choices.py   ->  data/ib-choices/all.json"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent.parent / "data" / "ib-choices"
subj = {"AA": "ib-mathematics-aa-hl", "BI": "ib-biology-hl", "PH": "ib-physics-hl", "CH": "ib-chemistry-hl", "EC": "ib-economics-hl"}
rows = []
for f in sorted((root / "out").glob("*.json")):
    d = json.loads(f.read_text(encoding="utf8"))
    for it in d["items"]:
        rows.append({"ref": d["ref"], "part": it["part"], "subject_slug": subj.get(d["ref"][:2], "unknown"), "stem": it["stem"], "options": it["options"], "correct": it["correct"], "check": it["check"]})
(root / "all.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf8")
print(len(rows), "items,", sum(r["check"] == "ok" for r in rows), "checked ok")
