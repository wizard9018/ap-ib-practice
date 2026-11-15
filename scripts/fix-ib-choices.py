"""Fix formatting of ib_choices rows: literal \n -> real newlines, inline <svg> in stems -> uploaded image.
python scripts/fix-ib-choices.py backup   -> data/ib-choices/backup_<stamp>.json (all rows)
python scripts/fix-ib-choices.py dry|apply"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
HERE = Path(__file__).resolve().parent
env = dict(l.strip().split("=", 1) for l in (HERE.parent / ".env.local").read_text(encoding="utf8").splitlines() if "=" in l and not l.startswith("#"))
U, SK = env["NEXT_PUBLIC_SUPABASE_URL"].strip(), env["SUPABASE_SERVICE_ROLE_KEY"].strip()
H = {"apikey": SK, "Authorization": f"Bearer {SK}"}
ROOT = HERE.parent.parent / "data" / "ib-choices"
# a literal backslash + n that is a stored newline, not a LaTeX command (neq, nu, not, notin, newline, nabla, neg, ni, ne, nleq, ngeq, nsim, nmid, ncong, ...)
LATEX_N = "eq|u|ot|otin|ewline|abla|eg|i|e|leq|geq|sim|mid|cong|parallel|less|gtr|vdash|earrow|warrow|rightarrow|leftarrow|Rightarrow|Leftarrow|atural|otag|onumber|ormalsize|ewcommand|ewpage|ull|exists|subseteq|supseteq|prec|succ|triangle"
LN = re.compile(re.escape(chr(92)) + "n(?!(?:" + LATEX_N + ")(?![a-zA-Z]))")
SVG = re.compile(r"<svg\b.*?</svg>", re.S)

def req(url, data=None, method="GET", extra=None):
    r = urllib.request.Request(url, data=data, method=method, headers={**H, **(extra or {})})
    return urllib.request.urlopen(r, timeout=60).read()

def all_rows():
    rows = []
    for off in range(0, 20000, 1000):
        d = json.loads(req(f"{U}/rest/v1/ib_choices?select=*&order=ref,part", extra={"Range": f"{off}-{off+999}"})); rows += d
        if len(d) < 1000: break
    return rows

def upload(ref, part, i, svg):
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{ref}_{part}_stem{i}.svg")
    req(f"{U}/storage/v1/object/questions/ib-choices-svg/{name}", svg.encode("utf8"), "POST", {"Content-Type": "image/svg+xml", "x-upsert": "true"})
    return f"![diagram]({U}/storage/v1/object/public/questions/ib-choices-svg/{name})"

def fix_text(t, ref, part, apply):
    t = LN.sub("\n", t)
    n = [0]
    def sub(m):
        n[0] += 1
        return upload(ref, part, n[0], m.group(0)) if apply else m.group(0)
    return SVG.sub(sub, t)

if __name__ == "__main__":
    mode = sys.argv[1]; rows = all_rows()
    if mode == "backup":
        f = ROOT / f"backup_{time.strftime('%Y%m%d_%H%M%S')}.json"; f.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf8"); print(f, len(rows)); sys.exit()
    changed = 0
    for r in rows:
        stem = fix_text(r["stem"], r["ref"], r["part"], mode == "apply")
        opts = {k: LN.sub("\n", v) for k, v in r["options"].items()}
        if stem == r["stem"] and opts == r["options"]: continue
        changed += 1
        if mode == "apply":
            req(f"{U}/rest/v1/ib_choices?ref=eq.{urllib.parse.quote(r['ref'])}&part=eq.{urllib.parse.quote(r['part'])}", json.dumps({"stem": stem, "options": opts}).encode(), "PATCH", {"Content-Type": "application/json"})
    print(mode, "rows changed:", changed)
