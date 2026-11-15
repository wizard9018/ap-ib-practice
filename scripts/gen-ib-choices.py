"""Pilot: turn written IB questions into per-part multiple-choice questions with Gemini, then verify with a second model.
Usage: python gen_choices.py <slug> <n> [seed]     (resumable: results cached in out/<ref>.json)
"""
import json, os, random, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

HERE = Path(__file__).parent
OUT = Path(os.environ.get("IB_CHOICES_OUT", HERE.parent.parent / "data" / "ib-choices" / "out")); OUT.mkdir(parents=True, exist_ok=True)
MINI = HERE.parent
env = dict(l.strip().split("=", 1) for l in (MINI / ".env.local").read_text(encoding="utf8").splitlines() if "=" in l and not l.startswith("#"))
U, K = env["NEXT_PUBLIC_SUPABASE_URL"].strip(), env["NEXT_PUBLIC_SUPABASE_ANON_KEY"].strip()
SK = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
GK = os.environ["GEMINI_API_KEY"]  # the key of the account that runs the generation
BASE = os.environ.get("GEMINI_BASE_URL", "http://127.0.0.1:8045/v1")
GEN, CHECK = os.environ.get("IB_GEN_MODEL", "gemini-3.8-flash-high"), os.environ.get("IB_CHECK_MODEL", "gemini-4-argon-medium")
ANS = re.compile(r"\*\*\s*(答案|Answer)\s*[:：]", re.I)
SVG_RE = re.compile(r"<svg\b[^>]*>.*?</svg>", re.S | re.I)


def upload_svg(ref, part, letter, svg_text):
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{ref}_{part}_{letter}.svg")
    url = f"{U}/storage/v1/object/questions/ib-choices-svg/{name}"
    req = urllib.request.Request(url, data=svg_text.encode("utf8"), method="POST", headers={"Authorization": f"Bearer {SK}", "apikey": SK, "Content-Type": "image/svg+xml", "x-upsert": "true"})
    urllib.request.urlopen(req, timeout=30)
    return f"![diagram]({U}/storage/v1/object/public/questions/ib-choices-svg/{name})"


def replace_svgs(ref, part, letter, text):
    text = re.sub(r"<br\s*/?>", "\n\n", text, flags=re.I)
    if "<svg" not in text.lower():
        return text
    def _sub(m):
        return upload_svg(ref, part, letter, m.group(0)) + "\n\n"
    return SVG_RE.sub(_sub, text).strip()


def fetch(slug):
    rows = []
    for off in range(0, 3000, 1000):
        r = urllib.request.Request(f"{U}/rest/v1/questions?select=ref,topic,subtopic,paper,marks,body,mark_scheme&subject_slug=eq.{slug}&order=ref", headers={"apikey": K, "Range": f"{off}-{off+999}"})
        try: d = json.load(urllib.request.urlopen(r))
        except Exception: break
        rows += d
        if len(d) < 1000: break
    return rows


def chat(model, prompt):
    for attempt in range(5):
        try:
            r = requests.post(f"{BASE}/chat/completions", headers={"Authorization": f"Bearer {GK}"}, json={"model": model, "messages": [{"role": "user", "content": prompt}]}, timeout=420)
            if r.status_code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as e:
            err = e
            time.sleep(2 * (attempt + 1))
    raise err


def js(text):
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    t = m.group(1) if m else text[text.index("["):text.rindex("]") + 1]
    # LaTeX backslashes: keep \ and \" as they are, double every other backslash (rac, eta, \( ...)
    out, i = [], 0
    while i < len(t):
        c = t[i]
        if c == "\\":
            nxt = t[i + 1] if i + 1 < len(t) else ""
            if nxt in ('"', "\\"): out.append(t[i:i + 2]); i += 2; continue
            out.append("\\\\"); i += 1; continue
        out.append(c); i += 1
    s = re.sub(r",(\s*[\]}])", r"\1", "".join(out))
    return json.loads(s, strict=False)


GEN_PROMPT = """You convert an IB exam question with its official mark scheme into multiple-choice questions, one per sub-part, so a student can record progress.

RULES
- Split the question into its sub-parts (1., 2., (a), (b) ...). If it has no parts, make one item. At most 6 items; if there are more, use the 6 most important. NEVER skip a question or output [].
- Each item: a self-contained stem (restate the sub-part and any given data/values it needs, in the same language as the question), exactly 4 options A-D, and the correct letter.
- The CORRECT option must come strictly from the mark scheme (final answer, or the key statement/mark-worthy point). Never invent a different answer.
- For LONG ESSAY / EXTENDED RESPONSE / PROOF / "SHOW THAT" / EXPLANATION parts: extract a concise summary of the core key points from the mark scheme (1-2 sentences) as the correct option, and write 3 distractors that contain clear, obvious factual, logical, or conceptual errors.
- For DRAWING / SKETCHING / GRAPHING / DIAGRAM parts (where the student must draw a graph, curve, supply/demand diagram, vector/force diagram, or structure): generate 4 compact inline SVG diagrams (one in each option A, B, C, D) using SINGLE QUOTES for all XML attributes, e.g. <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 160' width='220' height='150'>...</svg> (plus an optional short caption). The correct SVG must accurately reflect the mark scheme's diagram/graph features (axes, labels, curve shape, intercepts/asymptotes, shifts), and the 3 distractor SVGs must have clear visual errors (wrong shift direction, inverted curve, wrong intercept/slope/labels).
- For all other parts: keep options short (one line each, no working). Use LaTeX with $...$ for maths. Do not reveal the answer in the stem.
- Spread the correct letter across A-D.
- Output ONLY JSON: [{"part":"1","stem":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"B"}, ...].

QUESTION
%s

MARK SCHEME
%s
"""

CHECK_PROMPT = """Check these multiple-choice items against the original question and mark scheme.
Notes:
- For long essay, proof, "show that", or compare/contrast parts, summarizing the key points from the mark scheme into a single correct option with 3 clearly wrong distractors is VALID and expected (mark ok=true as long as the keyed option is accurate and distractors are wrong).
- For drawing/graphing parts, options containing <svg ...>...</svg> diagrams or diagram summaries are VALID and expected (mark ok=true if the keyed diagram/option matches the mark scheme and distractors have clear errors).
For every item answer whether (1) the keyed option is consistent with the mark scheme, (2) no other option is also correct, (3) the stem is clear and faithful to the sub-part.
Output ONLY JSON: [{"part":"1","ok":true,"issue":""}, ...] (ok=false with a short issue only when the keyed answer is actually wrong or another option is also right).

QUESTION
%s

MARK SCHEME
%s

ITEMS
%s
"""


def valid(items):
    out = []
    for it in items:
        o = it.get("options", {})
        if sorted(o) == ["A", "B", "C", "D"] and it.get("correct") in o and it.get("stem") and len({str(v).strip() for v in o.values()}) == 4 and all(str(v).strip() for v in o.values()):
            out.append({"part": str(it.get("part", "")), "stem": it["stem"], "options": {k: str(v) for k, v in o.items()}, "correct": it["correct"]})
    return out


def needs_redo(f):
    if not f.exists(): return True
    try:
        d = json.loads(f.read_text(encoding="utf8"))
        items = d.get("items", [])
        return not items or any(it.get("check") != "ok" for it in items)
    except Exception:
        return True


def work(row):
    f = OUT / f"{row['ref']}.json"
    if not needs_redo(f): return json.loads(f.read_text(encoding="utf8"))
    items = valid(js(chat(GEN, GEN_PROMPT % (row["body"], row["mark_scheme"]))))
    if not items:
        raise RuntimeError("empty items")
    verdict = js(chat(CHECK, CHECK_PROMPT % (row["body"], row["mark_scheme"], json.dumps(items, ensure_ascii=False))))
    bad = {str(v.get("part")): v.get("issue", "") for v in verdict if not v.get("ok")}
    for it in items:
        it["options"] = {k: replace_svgs(row["ref"], it["part"], k, v) for k, v in it["options"].items()}
        it["check"] = "ok" if it["part"] not in bad else "flagged: " + bad[it["part"]]
    res = {"ref": row["ref"], "topic": row["topic"], "subtopic": row["subtopic"], "items": items}
    f.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")
    return res


import time

def eligible(slug):
    return [r for r in fetch(slug) if r["paper"] != "Paper 1A" and not ANS.search((r["body"] or "") + " " + (r["mark_scheme"] or "")) and r["mark_scheme"]]


if __name__ == "__main__":
    # python gen_choices.py <budget seconds> <slug> [<slug> ...]   (resumable; stops starting new questions when the budget is used)
    budget = int(sys.argv[1]); deadline = time.time() + budget
    seen = set()
    todo = []
    for slug in sys.argv[2:]:
        for r in eligible(slug):
            if r["ref"] not in seen and needs_redo(OUT / f"{r['ref']}.json"):
                seen.add(r["ref"])
                todo.append(r)
    print("todo", len(todo), flush=True)
    stats = {"done": 0, "fail": 0, "skipped": 0}
    def job(r):
        if time.time() > deadline: stats["skipped"] += 1; return
        try: work(r); stats["done"] += 1
        except Exception as e: stats["fail"] += 1; print("fail", r["ref"], str(e)[:100], flush=True)
    with ThreadPoolExecutor(8) as ex: list(ex.map(job, todo))
    print(stats, "remaining", len(todo) - stats["done"] - stats["fail"], flush=True)
