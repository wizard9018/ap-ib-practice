"""Upload WebP copies of the IB question images next to the originals (<name>.webp). Originals and question text are not touched.
python scripts/webp-ib-images.py plan      -> list what is needed (no network writes)
python scripts/webp-ib-images.py upload    -> convert (local copy if present, else download) + upload
python scripts/webp-ib-images.py verify    -> HEAD every .webp url
Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Rollback: delete the keys in data/ib-choices/webp_uploaded.json."""
import io, json, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
env = dict(l.strip().split("=", 1) for l in (HERE.parent / ".env.local").read_text(encoding="utf8").splitlines() if "=" in l and not l.startswith("#"))
U, SK, AK = env["NEXT_PUBLIC_SUPABASE_URL"].strip(), env["SUPABASE_SERVICE_ROLE_KEY"].strip(), env["NEXT_PUBLIC_SUPABASE_ANON_KEY"].strip()
LOCAL = Path(r"C:/Users/wizar/Downloads/IB-Questionbank-Web/questions")
LOCAL_WEBP = Path(r"C:/Users/wizar/Downloads/IB-webp")
OUT = HERE.parent.parent / "data" / "ib-choices" / "webp_uploaded.json"
SLUGS = ["ib-mathematics-aa-hl", "ib-physics-hl", "ib-physics-sl", "ib-chemistry-hl", "ib-biology-hl", "ib-economics-hl"]
IMG = re.compile(r"\]\(<images/([^>]+)>\)|\]\(images/([^)\s]+)\)")
MAXW, QUALITY = 1200, 82


def rest(path, rng=None):
    h = {"apikey": AK}
    if rng: h["Range"] = rng
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{U}/rest/v1/{path}", headers=h), timeout=60))


def needed():
    names = {s["slug"]: s["name"] for s in rest("subjects?select=slug,name")}
    keys = {}
    for slug in SLUGS:
        for off in range(0, 3000, 1000):
            rows = rest(f"questions?select=ref,topic,subtopic,body,mark_scheme&subject_slug=eq.{slug}&order=ref", f"{off}-{off+999}")
            for r in rows:
                for text in (r["body"] or "", r["mark_scheme"] or ""):
                    for m in IMG.finditer(text):
                        name = m.group(1) or m.group(2)
                        keys[f"{names[slug]}/{r['topic']}/{r['subtopic']}/images/{name}"] = 1
            if len(rows) < 1000: break
    return sorted(keys)


def q(key): return urllib.parse.quote(key, safe="/")


def source_bytes(key):
    f = LOCAL / key
    if f.exists(): return f.read_bytes(), "local"
    return urllib.request.urlopen(f"{U}/storage/v1/object/public/questions/{q(key)}", timeout=60).read(), "download"


def to_webp(data):
    im = Image.open(io.BytesIO(data)); im.load()
    if getattr(im, "is_animated", False): im.seek(0)
    if im.mode == "P": im = im.convert("RGBA")
    elif im.mode not in ("RGB", "RGBA", "L", "LA"): im = im.convert("RGBA" if "A" in im.mode else "RGB")
    if im.width > MAXW: im = im.resize((MAXW, max(1, round(im.height * MAXW / im.width))), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "WEBP", quality=QUALITY, method=6); return buf.getvalue()


def upload(key):
    try:
        data, src = source_bytes(key)
        webp = to_webp(data)
        req = urllib.request.Request(f"{U}/storage/v1/object/questions/{q(key)}.webp", data=webp, method="POST", headers={"apikey": SK, "Authorization": f"Bearer {SK}", "Content-Type": "image/webp", "x-upsert": "true"})
        urllib.request.urlopen(req, timeout=60)
        return {"key": key + ".webp", "src": src, "before": len(data), "after": len(webp)}
    except Exception as e:
        return {"key": key, "error": str(e)[:150]}


def head(key):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"{U}/storage/v1/object/public/questions/{q(key)}", method="HEAD"), timeout=30); return r.status == 200
    except Exception: return False


if __name__ == "__main__":
    mode = sys.argv[1]
    keys = needed()
    if mode == "plan":
        loc = sum((LOCAL / k).exists() for k in keys)
        print("images referenced by questions:", len(keys), "| found locally:", loc, "| must download:", len(keys) - loc)
    elif mode == "upload":
        with ThreadPoolExecutor(8) as ex: res = list(ex.map(upload, keys))
        OUT.write_text(json.dumps(res, indent=0), encoding="utf8")
        ok = [r for r in res if "error" not in r]
        print("uploaded", len(ok), "errors", len(res) - len(ok), "| before MB", round(sum(r["before"] for r in ok) / 1e6, 1), "after MB", round(sum(r["after"] for r in ok) / 1e6, 1), "| downloaded", sum(r["src"] == "download" for r in ok))
        for r in res:
            if "error" in r: print("ERR", r["key"][-70:], r["error"])
    elif mode == "verify":
        keys = [k for k in keys if not k.lower().endswith(".svg")]   # vector images stay as they are
        with ThreadPoolExecutor(16) as ex: ok = list(ex.map(lambda k: head(k + ".webp"), keys))
        print("webp reachable:", sum(ok), "of", len(keys))
        for k, o in zip(keys, ok):
            if not o: print("MISSING", k[-80:])
