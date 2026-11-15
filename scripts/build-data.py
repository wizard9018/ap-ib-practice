"""Builds the mini site's data from the reviewed text OCR of the 2008 AP Calculus AB exam.
    python scripts/build-data.py     (run from the mini folder)
Writes data/questions.json (the 45 multiple-choice questions, in original order) and copies the figures they use to public/exam-images/.
"""
import html, json, os, re, shutil, struct

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(HERE), "data", "calculus-ab-2008-text")
d = json.load(open(os.path.join(SRC, "exam.json"), encoding="utf-8"))

SECTIONS = {
    "I-A": {"title": "Section I, Part A", "minutes": 55, "calculator": False, "directions": ["解答下面每道题,可以在草稿纸上演算。看过选项后,选出最合适的一个。", "除非另有说明,函数 f 的定义域是使 f(x) 为实数的所有实数 x。", "本部分不允许使用计算器。", "不要在任何一道题上花太多时间。"], "note": "28 questions · 55 minutes in the original exam · no calculator"},
    "I-B": {"title": "Section I, Part B", "minutes": 50, "calculator": True, "directions": ["解答下面每道题,可以在草稿纸上演算。看过选项后,选出最合适的一个。", "正确答案的精确值不一定出现在选项里;这时选择最接近精确值的那个选项。", "除非另有说明,函数 f 的定义域是使 f(x) 为实数的所有实数 x。", "本部分需要图形计算器,部分题目不一定要用到。"], "note": "17 questions · 50 minutes in the original exam · graphing calculator required"},
}
out_dir = os.path.join(HERE, "public", "exam-images")
shutil.rmtree(out_dir, ignore_errors=True)
os.makedirs(out_dir, exist_ok=True)


def blocks(content):
    res = []
    for b in content:
        if b["type"] == "image":
            # the OCR also cut out the repeated "B" banner printed at the top of every Part B page (height 62-73 px);
            # real figures are at least 190 px tall
            with open(os.path.join(SRC, b["path"]), "rb") as f: height = struct.unpack(">I", f.read(24)[20:24])[0]
            if height < 100: continue
            name = os.path.basename(b["path"]); shutil.copyfile(os.path.join(SRC, b["path"]), os.path.join(out_dir, name))
            res.append({"type": "image", "src": "/exam-images/" + name})
        elif b["type"] == "text":
            # a table arrives as an HTML string inside the text: split it into text / table / text
            for part in re.split(r"(<table>.*?</table>)", b["markdown"], flags=re.S):
                if part.startswith("<table>"):
                    rows = [[html.unescape(c).strip() for c in re.findall(r"<td>(.*?)</td>", r, flags=re.S)] for r in re.findall(r"<tr>(.*?)</tr>", part, flags=re.S)]
                    res.append({"type": "table", "rows": rows})
                elif part.strip():
                    res.append({"type": "text", "text": html.unescape(part.strip())})
    return res


qs = []
for q in d["questions"]:
    if q["type"] != "multiple_choice": continue
    assert q["answer"]["correct_choice"] and len(q["choices"]) == 5
    qs.append({"id": q["id"], "number": q["number"], "section": q["section_id"], "prompt": blocks(q["prompt"]["content"]),
               "choices": [{"label": c["label"], "content": blocks(c["content"])} for c in q["choices"]], "correct": q["answer"]["correct_choice"]})

json.dump({"exam": "2008 AP Calculus AB", "sections": SECTIONS, "source": "data/calculus-ab-2008-text/exam.json (text review pending)", "questions": qs},
          open(os.path.join(HERE, "data", "questions.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(len(qs), "questions,", len(os.listdir(out_dir)), "figures")
