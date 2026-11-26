#!/usr/bin/env python3
"""Find data-quality problems in the master sheet, for the researcher to settle on /quality/.

    python scripts/quality_checks.py build     find the checks in the latest master sheet export
    python scripts/quality_checks.py push      send them to the "Data checks" tab of the sheet
    python scripts/quality_checks.py pull      fetch the decisions and write the list of changes
    python scripts/quality_checks.py sample    use the checks as the pages' demo data (no sheet needed)

Three kinds of check, each with its own page:

  rules     a field that breaks a rule (Diaspora with a homeland country, a date outside its
            period, a date range written backwards...). Decided once per rule, with exceptions.
  spelling  one name or term written several ways. The researcher picks one form for all rows.
            Capital letters are settled by rule instead (titles in sentence case, names keep their
            capitals...): one decision per rule for every cell it touches, with exceptions.
  text      text read off the image while drafting (captions, stamps, signatures). The researcher
            confirms or corrects each reading; the inscription fields follow from it. What the sheet
            already has is taken as done: a reading already in a description (word for word or in
            translation), and the inscription type and language the researcher filled in.

Every check is one possible change to one cell: photo ID, column, current value, proposed value.
Nothing here writes to the Main tab. `pull` writes describe/quality/changes.csv (ID, column, old
value, new value) to check and apply by hand, and compares each old value with the latest export,
so a cell changed since the check was made is marked instead of overwritten.

`build` reads the newest PhotoArchive_Master_Sheet*.xlsx in data/ (its Main tab, and the
researcher's Glossary tab, whose spellings are the standard), the readings in
describe/batches/*/drafts.json and the spelling list in describe/quality/terms.json.
`push` adds new checks, keeps every decided one, and removes undecided ones that no longer apply
(the sheet was fixed), so it is safe to run after each new export.
"""

import csv
import difflib
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from master_sheet import FIRST_DATA_ROW, HEADER_ROW, latest_master  # noqa: E402
from push_drafts import call, endpoint, key  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
QUALITY = ROOT / "describe" / "quality"
BATCHES = ROOT / "describe" / "batches"
IMAGES = ROOT / "src" / "images.json"
SAMPLE = ROOT / "assets" / "quality" / "sample.json"

# key -> start of the column name in row 3 of the Main tab.
COLS = {
    "id": "File ID", "status": "Status", "location": "Location", "country": "Country",
    "region": "Region", "locality": "Locality", "sublocality": "Sub-Locality",
    "period": "Historic period", "date": "Date taken", "dateType": "Date type",
    "personas": "Are personas known?", "names": "Names of personas", "dignitaries": "Dignitaries name(s)",
    "born": "Dignitary born (year)", "died": "Dignitary died (year)",
    "inscription": "Script, Sidenote", "language": "Script, Sidenote Language",
    "title": "Photo title", "notes": "Photo description", "s3": "Final file S3",
    "photographer": "Photographer", "creator": "Creator", "keywords": "Keywords",
}

# Homeland: the Circassian lands in the Caucasus. Russia as a whole is listed because the sheet
# uses "Russian Federation" for Krasnodar, Sochi and Tuapse too.
HOMELAND = {"Russian Federation", "Abkhazia", "Georgia"}
ABROAD_EXCEPT = HOMELAND | {"Unknown", ""}

# Columns whose values come from a short list or name one thing: clustered for spelling variants.
VOCAB = [
    "Museum description", "Book Desctription", "Personal Collection Description", "Photographer",
    "Region", "Locality", "Sub-Locality", "Animals in photo", "Tribe", "Dignitary",
    "Dignitary born (country)", "Dignitary died (country)", "Dignitaries name(s)",
    "Ornaments description", "Place description", "House descdription", "Rituals description",
    "Art type", "Owner", "Creator", "Fashion description", "Dance description",
    "Musical instrument description", "Horses description", "Map region", "Photo title",
    "Names of personas",
]
# Columns searched for the terms in terms.json.
TERM_COLUMNS = ["Photo title", "Names of personas", "Dignitaries name(s)", "Photographer", "Creator",
                "Region", "Locality", "Sub-Locality", "Place description", "Photo description", "Keywords"]
# Words that make two otherwise similar values different things, not two spellings.
DISTINCT = {"male", "female", "men", "women", "man", "woman", "boy", "girl", "first", "second", "third",
            "upper", "lower", "north", "south", "east", "west", "old", "new", "and", "or", "with"}

# Capital letters, decided once per rule (see caps()). Short description fields start with a capital;
# a field "separated by comma" has a capital on each item.
CAPS_START = ["Animals in photo", "Ornaments description", "House descdription", "Rituals description",
              "Fashion description", "Dance description", "Musical instrument description",
              "Place description", "Horses description", "Tribe", "Art type", "Map region"]
CAPS_EACH = ["Animals in photo"]
WORD = re.compile(r"[A-Za-z][a-z'’-]*")
SENTENCE_START = '.!?:;"“(\n–'

# What the spelling page shows of each photo's record, so the researcher can weigh which record
# is more credible before a form becomes the standard. Label -> columns (joined when several).
RECORD = [
    ("Title", ["Photo title"]), ("Date", ["Date taken"]), ("Date type", ["Date type"]),
    ("Period", ["Historic period"]),
    ("Place", ["Sub-Locality", "Locality", "Region", "Country", "Location"]),
    ("Photographer", ["Photographer"]), ("Creator", ["Creator"]), ("Owner", ["Owner"]),
    ("Source", ["Museum description", "Book Desctription", "Personal Collection Description", "Website URL"]),
    ("People", ["Names of personas"]), ("Dignitaries", ["Dignitaries name(s)"]), ("Tribe", ["Tribe"]),
    ("Description", ["Photo description"]), ("Keywords", ["Keywords"]), ("Source file", ["Source File name"]),
]
RECORD_PAGES = {"spelling"}

INSCRIPTION_TYPES = ["None", "Sidenote", "Script", "Watermark", "Both"]
LANGUAGES = ["Russian", "English", "French", "Arabic", "Turkish", "German", "Circassian", "Italian",
             "Latin", "Georgian", "Hungarian"]


# ---- Reading the sheet ------------------------------------------------------------------

def cell(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def read_sheet(path):
    """Accepted photos as {"id", "row", "cells": {column name: value}}, plus the column letters."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = wb["Main"].iter_rows(values_only=True)
    names, photos = [], []
    for n, row in enumerate(rows, start=1):
        if n == HEADER_ROW:
            names = [" ".join(str(c or "").split("\n")[0].split()) for c in row]
        if n < FIRST_DATA_ROW or not row or not cell(row[0]):
            continue
        cells = {name: cell(row[i]) for i, name in enumerate(names) if name and i < len(row)}
        photos.append({"id": str(int(float(cell(row[0])))), "row": n, "cells": cells})
    letters = {name: get_column_letter(i + 1) for i, name in enumerate(names) if name}
    return names, letters, photos


def column_for(names, start):
    for name in names:
        if name.lower() == start.lower():
            return name
    for name in names:
        if name.lower().startswith(start.lower()):
            return name
    raise KeyError(f'No column starting with "{start}" in row {HEADER_ROW}')


class Sheet:
    def __init__(self, path):
        self.path = path
        self.names, self.letters, rows = read_sheet(path)
        self.col = {k: column_for(self.names, v) for k, v in COLS.items()}
        self.photos = [p for p in rows if p["cells"].get(self.col["status"]) == "Accepted"]
        self.by_id = {p["id"]: p for p in self.photos}
        self.thumbs = json.loads(IMAGES.read_text(encoding="utf-8")) if IMAGES.exists() else {}

    def get(self, photo, k):
        return photo["cells"].get(self.col[k], "")

    def image(self, photo):
        return self.get(photo, "s3")

    def thumb(self, photo):
        """The 800px copy, for the photos that have one (those on the site, see make_images.py).
        The others have none yet, and the pages show the original instead."""
        copy = self.thumbs.get(self.image(photo))
        return copy["thumb"] if copy else ""


# ---- One check row -------------------------------------------------------------------------

def row(sheet, photo, page, check, column, current, proposed="", **extra):
    """One possible change. `check` groups the rows decided together; its question, hint and
    options are repeated on each row so every row stands alone in the sheet."""
    match = extra.pop("match", "")
    op = extra.pop("op", "set")
    key = "|".join([page, check["id"], photo["id"], column, match or extra.get("ref", "")])
    return {
        "key": key, "page": page, "check": check["id"], "question": check["question"],
        "hint": check.get("hint", ""), "options": "|".join(check.get("options", [])),
        "id": photo["id"], "column": column, "letter": sheet.letters.get(column, ""),
        "op": op, "match": match, "current": current, "proposed": proposed,
        "title": sheet.get(photo, "title"), "imageUrl": sheet.image(photo), "thumbUrl": sheet.thumb(photo),
        "context": json.dumps(extra.get("context", {}), ensure_ascii=False),
    }


# ---- Rules -----------------------------------------------------------------------------------

def century(year):
    """As the sheet counts them: the 1800s are the 19th century, 1900 is the 20th."""
    c = year // 100 + 1
    return f"{c}{'st' if c % 10 == 1 and c != 11 else 'nd' if c % 10 == 2 and c != 12 else 'rd' if c % 10 == 3 and c != 13 else 'th'}"


def years(text):
    return [int(y) for y in re.findall(r"(?<!\d)(\d{4})(?!\d)", text)]


def rules(sheet):
    out = []
    s, g = sheet, sheet.get
    loc_col, period_col, date_col = s.col["location"], s.col["period"], s.col["date"]
    place = lambda p: {"Country": g(p, "country"), "Region": g(p, "region"), "Locality": g(p, "locality"), "Date": g(p, "date")}

    # Location against country.
    checks = {
        "diaspora-capitals": {"id": "diaspora-capitals", "options": ["Homeland", "Diaspora"],
            "question": "Moscow and Saint Petersburg are marked Diaspora. Is that right?",
            "hint": "These photos are in Russia but outside the Circassian lands. Paintings and maps take the location of the hard copy."},
        "diaspora-russia": {"id": "diaspora-russia", "options": ["Homeland", "Diaspora"],
            "question": "Marked Diaspora, but the country is in the homeland and no region is given.",
            "hint": "Set the region if you know it. Paintings and maps take the location of the hard copy, not what they show."},
        "homeland-abroad": {"id": "homeland-abroad", "options": ["Homeland", "Diaspora"],
            "question": "Marked Homeland, but the country is outside the homeland."},
        "location-empty": {"id": "location-empty", "options": ["Homeland", "Diaspora"],
            "question": "Location is empty, but the country is known.",
            "hint": "The proposed value follows the country."},
    }
    for p in s.photos:
        loc, country, region = g(p, "location"), g(p, "country"), g(p, "region")
        home = country in HOMELAND or country.startswith("RF")
        if loc == "Diaspora" and home:
            c = checks["diaspora-capitals" if region in ("Moscow", "Saint-Petersburg") else "diaspora-russia"]
            out.append(row(s, p, "rules", c, loc_col, loc, "", context=place(p)))
        elif loc == "Homeland" and country not in ABROAD_EXCEPT and not home:
            out.append(row(s, p, "rules", checks["homeland-abroad"], loc_col, loc, "Diaspora", context=place(p)))
        elif not loc and country and country != "Unknown":
            out.append(row(s, p, "rules", checks["location-empty"], loc_col, "", "Homeland" if home else "Diaspora", context=place(p)))

    # Date against period. Changing the period renames the file, so it is said up front.
    period_check = {"id": "period", "options": [f"{n}th" for n in range(15, 21)] + ["21st", "nAn"],
        "question": "The historic period does not match the year the photo was taken.",
        "hint": "The proposed period follows the first year of the date. Changing the period changes the file name, so the file must be renamed too."}
    for p in s.photos:
        d, period = g(p, "date"), g(p, "period")
        ys = years(d)
        if not ys:
            continue
        want = century(ys[0])
        if period != want and not (len(ys) > 1 and century(ys[-1]) == period):
            out.append(row(s, p, "rules", period_check, period_col, period, want,
                           context={"Date taken": d, "Date type": g(p, "dateType")}))

    # Date format: one year, or "YYYY - YYYY" in order.
    reversed_check = {"id": "date-reversed", "question": "The date range is written backwards.",
                      "hint": "The proposed value swaps the two years."}
    format_check = {"id": "date-format", "question": "The date is not written as a year or a range of years.",
                    "hint": "The sheet uses 1920, or 1920 - 1925. A decade that is not certain can be a range: 1930 - 1939, with Date type Estimate."}
    for p in s.photos:
        d = g(p, "date")
        if not d or re.fullmatch(r"\d{4}", d):
            continue
        m = re.fullmatch(r"(\d{4})\s*[-–—]\s*(\d{4})", d)
        if m and int(m[1]) > int(m[2]):
            out.append(row(s, p, "rules", reversed_check, date_col, d, f"{m[2]} - {m[1]}", context={"Date type": g(p, "dateType"), "Period": g(p, "period")}))
        elif m and d != f"{m[1]} - {m[2]}":
            out.append(row(s, p, "rules", format_check, date_col, d, f"{m[1]} - {m[2]}", context={"Date type": g(p, "dateType")}))
        elif not m:
            decade = re.fullmatch(r"(\d{3})\?", d)
            out.append(row(s, p, "rules", format_check, date_col, d,
                           f"{decade[1]}0 - {decade[1]}9" if decade else "", context={"Date type": g(p, "dateType")}))

    # Lifespans that cannot be right as written.
    life_check = {"id": "lifespan", "question": "The dignitary's years give an impossible lifespan.",
                  "hint": "Correct the year of death, or keep it if the claim is the point (a reported supercentenarian)."}
    for p in s.photos:
        b, d = g(p, "born"), g(p, "died")
        if b.isdigit() and d.isdigit() and (int(d) - int(b) > 105 or int(d) < int(b)):
            out.append(row(s, p, "rules", life_check, s.col["died"], d, "",
                           context={"Dignitary": g(p, "dignitaries"), "Born": b, "Died": d, "Lifespan": f"{int(d) - int(b)} years"}))

    # Anonymous, but names are given.
    anon_check = {"id": "anonymous-named", "options": ["Yes", "Anonymous", "Not applicable"],
                  "question": "Marked Anonymous, but the names field has names."}
    for p in s.photos:
        if g(p, "personas") == "Anonymous" and g(p, "names"):
            out.append(row(s, p, "rules", anon_check, s.col["personas"], "Anonymous", "Yes", context={"Names": g(p, "names")}))
    return out


# ---- Capital letters -------------------------------------------------------------------------

def cap_first(text):
    """The first letter raised: "wedding" -> "Wedding". Links and non-Latin text stay as they are."""
    m = re.match(r"([\W\d_]*)([a-z])", text)
    return text if not m or text.startswith("http") else text[:m.end(1)] + m.group(2).upper() + text[m.end():]


def cap_each(text):
    return re.sub(r"(^|,\s*)([a-z])", lambda m: m.group(1) + m.group(2).upper(), text)


class Caps:
    """The capital-letter rules, also used so the spelling cards skip what a rule already settles."""

    def __init__(self, sheet, names):
        s = sheet
        self.names = names
        self.start = [column_for(s.names, c) for c in CAPS_START]
        self.each = {column_for(s.names, c) for c in CAPS_EACH}
        self.name_columns = list(dict.fromkeys(column_for(s.names, c) for c in TERM_COLUMNS + VOCAB))
        self.title = s.col["title"]
        # Ordinary words: written in lower case in the middle of a sentence more often than not, in the
        # descriptions and titles. Circassian, Kabardian or Syria never are, so they keep their capital.
        lower, upper = Counter(), Counter()
        for p in s.photos:
            for k in ("notes", "title"):
                text = s.get(p, k)
                for m in WORD.finditer(text):
                    before = text[:m.start()].rstrip()
                    if not before or before[-1] in SENTENCE_START:
                        continue  # a sentence starts here
                    w = m.group(0)
                    (upper if w[0].isupper() else lower)[w.lower()] += 1
        self.ordinary = {w for w in lower if lower[w] > upper[w]}

    def name_spans(self, text):
        """(start, end, name) for each name in the text, whatever its case."""
        return [(m.start(), m.end(), n) for n in self.names
                for m in re.finditer(r"(?<!\w)" + re.escape(n) + r"(?!\w)", text, re.I)]

    def sentence(self, title):
        """A title in sentence case: "Circassian Warrior" -> "Circassian warrior". Only ordinary words
        are lowered; names, and the words of the names list, keep their capitals."""
        spans = self.name_spans(title)
        out = list(title)
        for i, m in enumerate(WORD.finditer(title)):
            w = m.group(0)
            before = title[:m.start()].rstrip()
            if i == 0 or not before or before[-1] in SENTENCE_START or title[m.start() - 1] in "-‑"                     or not (w[0].isupper() and w[1:].islower()):
                continue
            if w.lower() in self.ordinary and not any(a <= m.start() < b for a, b, _ in spans):
                out[m.start()] = w[0].lower()
        return "".join(out)

    def names_fixed(self, text):
        for a, b, n in sorted(self.name_spans(text), reverse=True):
            text = text[:a] + n + text[b:]
        return text

    def fix(self, column, value):
        """The value after every rule that applies to its column."""
        if column in self.name_columns:
            value = self.names_fixed(value)
        if column in self.each:
            value = cap_each(value)
        elif column in self.start:
            value = cap_first(value)
        if column == self.title:
            value = self.sentence(value)
        return value


def caps(sheet, rule):
    """One check per rule. Each row is one cell the rule changes; the researcher approves the rule
    once and unticks the exceptions."""
    out = []
    s = sheet

    # Short description fields start with a capital.
    found, total = [], 0
    check = {"id": "caps-start", "question": "Short description fields start with a capital letter"}
    for column in rule.start:
        for p in s.photos:
            v = p["cells"].get(column, "")
            if not v:
                continue
            total += 1
            new = cap_each(v) if column in rule.each else cap_first(v)
            if new != v:
                found.append((p, column, v, new))
    check["hint"] = (f"{total - len(found)} of {total} values in these columns already do. Only the first letter "
                     "changes (wedding becomes Wedding); in Animals, each animal gets one. "
                     "Untick a value that should stay as it is.")
    out += [row(s, p, "spelling", check, column, v, new, context={"_caps": True}) for p, column, v, new in found]

    # Photo titles in sentence case.
    titles = [p for p in s.photos if s.get(p, "title")]
    found = [(p, rule.sentence(s.get(p, "title"))) for p in titles]
    found = [(p, new) for p, new in found if new != s.get(p, "title")]
    check = {"id": "caps-titles", "question": "Photo titles take a capital only on the first word and on names",
             "hint": f"{len(titles) - len(found)} of {len(titles)} titles already do. Ordinary words (horse, warrior, "
                     "wedding) are lowered; names keep their capitals. Untick a title that is itself a name, "
                     "such as a painting, a group or an association."}
    out += [row(s, p, "spelling", check, rule.title, s.get(p, "title"), new, context={"_caps": True}) for p, new in found]

    # Names keep their capitals everywhere (the "capitals" list in terms.json).
    found = []
    for p in s.photos:
        for column in rule.name_columns:
            text = p["cells"].get(column, "")
            seen = set()
            for a, b, n in sorted(rule.name_spans(text)):
                form = text[a:b]
                if form == n or form in seen:
                    continue
                seen.add(form)
                found.append((p, column, text, form, n, a))
    if found:
        wrong = list(dict.fromkeys(f[4] for f in found))
        check = {"id": "caps-names", "question": "Names keep their capitals: " + ", ".join(wrong),
                 "hint": "Wherever they are written in lower case. Untick a place where the words are not the name."}
        for p, column, text, form, n, at in found:
            snippet = text[max(0, at - 70): at + len(form) + 70]
            out.append(row(s, p, "spelling", check, column, text, n, op="replace", match=form,
                           context={"_caps": True, "snippet": ("…" if at > 70 else "") + snippet
                                    + ("…" if at + len(form) + 70 < len(text) else "")}))
    return out


# ---- The researcher's glossary ----------------------------------------------------------------

def read_glossary(path):
    """The terms in column A of the Glossary tab: [(term, unsure)]. "Khushnyieh ?" is a spelling
    the researcher is not sure of. "Circassian exile, Circassian deportation" is two terms."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "Glossary" not in wb.sheetnames:
        return []
    out = []
    for r in wb["Glossary"].iter_rows(values_only=True):
        if not r or not r[0] or not str(r[0]).strip():
            continue
        text = str(r[0]).strip()
        unsure = text.endswith("?")
        for part in re.split(r",\s*", text.rstrip("? ").strip()):
            if part and part not in [t for t, _ in out]:
                out.append((part, unsure))
    return out


TOKEN = re.compile(r"[^\W\d_][\w'\u2019]*")


def spelled_alike(word, other):
    """Two spellings of one word (Shapsug, Shabsug), not two words: not a plural, not one word
    inside another (Circassia, Circassian), and a letter or two apart in a long word."""
    a, b = word.lower(), other.lower()
    if a == b or a[0] != b[0] or abs(len(a) - len(b)) > 2:
        return False
    longer, shorter = (a, b) if len(a) > len(b) else (b, a)
    if longer.startswith(shorter) and (len(longer) - len(shorter) > 1 or longer[-1] in "sn"):
        return False  # another word made from it: Circassia, Circassian; Alim, Alimov
    if a.rstrip("s") == b.rstrip("s"):
        return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def glossary_terms(sheet, glossary, columns, known):
    """The glossary's spellings, written another way in the sheet. A one-name term (Shapsug, or
    Azheghafe in "Azheghafe mask") is looked for word by word; a longer name (Baterbek Alimov) only
    as the whole name, so Batyrbek Shardanov is not taken for Baterbek. Common words of the sheet
    (Circassian, Adyghe) are not looked for: their look-alikes are other words (Circassia, Adygea)."""
    texts = [p["cells"].get(c, "") for p in sheet.photos for c in columns]
    words = Counter(w for t in texts for w in TOKEN.findall(t))
    out = []
    for term, unsure in glossary:
        names = [w for w in TOKEN.findall(term) if w[0].isupper()]
        if len(names) == 1 and len(names[0]) >= 6:
            phrase = names  # the name alone: the other words describe it
        elif len(names) > 1 and all(w[0].isupper() for w in TOKEN.findall(term)):
            phrase = names  # a person's or a group's full name
        else:
            continue
        if any(w in known for w in phrase) or any(words[w] > 40 for w in phrase):
            continue
        found = Counter()
        size = len(phrase)
        for text in texts:
            spans = list(TOKEN.finditer(text))
            for i in range(len(spans) - size + 1):
                window = spans[i:i + size]
                if all(m.group(0) == w or spelled_alike(w, m.group(0)) for m, w in zip(window, phrase)) \
                        and any(m.group(0) != w for m, w in zip(window, phrase)):
                    found[text[window[0].start():window[-1].end()]] += 1
        found = {v: n for v, n in found.items() if len(re.findall(r"\s+", v)) == size - 1}  # no line breaks inside
        if not found:
            continue
        form = " ".join(phrase)
        known.update(phrase)
        out.append({"forms": [form] + sorted(found, key=lambda v: -found[v]), "glossary": form, "unsure": unsure})
    return out


# ---- Spelling ---------------------------------------------------------------------------------

def norm(value):
    v = value.casefold().strip(" ,.;:")
    v = re.sub(r"^the\s+", "", v)
    v = re.sub(r"[\s,;]+", " ", v)
    return v.replace("’", "'")


def similar_word(a, b):
    """Two words that are one word spelled two ways: Alievitch and Alivetch, Kuban and Cuban.
    A plural is not a spelling (one man or a group), nor is a different word (belt, hat)."""
    if a == b:
        return True
    if a.rstrip("s") == b.rstrip("s") or (a[:-3], a[-3:], b[-3:]) == (b[:-3], "man", "men") or (b[:-3], b[-3:], a[-3:]) == (a[:-3], "man", "men") or abs(len(a) - len(b)) > 1 or min(len(a), len(b)) < 4:
        return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.75


def similar(a, b):
    """Two values that look like one spelled two ways: the same words, in the same order, with
    at most small differences of case, spacing, punctuation or letters."""
    na, nb = norm(a), norm(b)
    if ("?" in na) != ("?" in nb):  # "?, Tokh Chilezakh" says someone is unnamed
        return False
    if na == nb:
        return True
    wa, wb = re.findall(r"\w+", na), re.findall(r"\w+", nb)
    if len(wa) != len(wb) or re.findall(r"\d+", na) != re.findall(r"\d+", nb) or (set(wa) ^ set(wb)) & DISTINCT:
        return False
    differ = [(x, y) for x, y in zip(wa, wb) if x != y]
    return len(differ) <= 2 and all(similar_word(x, y) for x, y in differ)


def clusters(values):
    """Groups of distinct values (two or more) that are spellings of one value."""
    keys = list(values)
    parent = {k: k for k in keys}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if similar(a, b):
                parent[find(a)] = find(b)
    groups = defaultdict(list)
    for k in keys:
        groups[find(k)].append(k)
    return [sorted(g, key=lambda v: -len(values[v])) for g in groups.values() if len(g) > 1]


def spelling(sheet):
    out = []
    s = sheet
    data = json.loads((QUALITY / "terms.json").read_text(encoding="utf-8"))
    terms = data["terms"]
    glossary = read_glossary(s.path)
    # Names keep their capitals: the list in terms.json, and the glossary's names of two words or
    # more written in capitals ("Circassian Cavalry"; "The Adyghe School" without its "The").
    names = list(data.get("capitals", []))
    for t, _ in glossary:
        t = re.sub(r"^The\s+", "", t)
        if len(t.split()) > 1 and all(w[0].isupper() for w in t.split() if len(w) > 3) and re.fullmatch(r"[A-Za-z' -]+", t):
            names.append(t)
    rule = Caps(s, list(dict.fromkeys(names)))
    out += caps(s, rule)
    columns = list(dict.fromkeys(column_for(s.names, c) for c in TERM_COLUMNS + VOCAB))
    glossary_words = {w.lower() for t, _ in glossary for w in re.findall(r"\w+", t)}
    # The glossary's words, spelled another way in the sheet, join the terms (unless terms.json has them).
    terms = terms + glossary_terms(s, glossary, columns, {f for t in terms for f in t["forms"]})
    term_columns = set(columns)
    term_forms = [f for t in terms for f in t["forms"]]

    def in_glossary(form):
        """The form, when the glossary has it (alone or as a word of a longer term)."""
        words = [w.lower() for w in re.findall(r"\w+", form)]
        return bool(words) and all(w in glossary_words for w in words if len(w) > 3)

    def covered(column, group):
        """A group the terms already settle (Qunaitra in Place description): asked once, there."""
        return column in term_columns and any(re.search(r"(?<!\w)" + re.escape(f) + r"(?!\w)", v) for v in group for f in term_forms)

    for start in VOCAB:
        column = column_for(s.names, start)
        values = defaultdict(list)
        for p in s.photos:
            v = p["cells"].get(column, "")
            if v and v.lower() not in ("nan", "none", "unknown"):
                values[v].append(p)
        for group in clusters(values):
            if covered(column, group) or len({rule.fix(column, v) for v in group}) == 1:
                continue  # settled by the terms, or by a capital-letter rule
            marked = [v for v in group if in_glossary(v)]
            first = marked[0] if len(marked) == 1 else group[0]
            check = {"id": "cell-" + hashlib.sha1((column + "|" + "|".join(sorted(group))).encode()).hexdigest()[:10],
                     "question": f"{column}: one value, written {len(group)} ways?",
                     "hint": "Pick the form to keep. Every row then uses it. If they are different things, say so and nothing changes.",
                     "options": group}
            for v in group:
                for p in values[v]:
                    out.append(row(s, p, "spelling", check, column, v, first,
                                   context={"variant": v, "glossary": first if len(marked) == 1 else ""}))

    # Names and terms spelled differently inside longer text (terms.json, grown from drafting, and
    # the glossary).
    for t in terms:
        forms = t["forms"]
        found = []
        for p in s.photos:
            for column in columns:
                text = p["cells"].get(column, "")
                for form in forms:
                    for m in re.finditer(r"(?<!\w)" + re.escape(form) + r"(?!\w)", text):
                        found.append((p, column, text, form, m.start()))
        if t.get("fix"):  # a typo: only the rows that have it
            found = [f for f in found if f[3] != t["fix"]]
        used = {f[3] for f in found}
        if not found or (len(used) < 2 and not t.get("fix") and not (t.get("glossary") and used != {t["glossary"]})):
            continue  # only one form left in the sheet: nothing to settle
        gloss = t.get("glossary", "")
        question = t.get("question") or f"One name, written {len(used)} ways: {', '.join(f for f in forms if f in used)}?"
        if gloss:
            question = (f"The glossary has {gloss}" + (" (marked unsure)" if t.get("unsure") else "")
                        + f"; the sheet also has {', '.join(f for f in forms[1:] if f in used)}.")
        check = {"id": "term-" + re.sub(r"\W+", "-", forms[0].lower()).strip("-"),
                 "question": question,
                 "hint": t.get("hint", "Pick the form to keep; it replaces the others wherever they appear. "
                                     "If they are different people or places, say so and nothing changes."),
                 "options": forms}
        seen = set()
        for p, column, text, form, at in found:
            if (p["id"], column, form) in seen:
                continue
            seen.add((p["id"], column, form))
            snippet = text[max(0, at - 70): at + len(form) + 70]
            proposed = t.get("fix") or forms[0]
            out.append(row(s, p, "spelling", check, column, text, proposed, op="replace", match=form,
                           context={"variant": form, "glossary": gloss, "snippet": ("…" if at > 70 else "") + snippet + ("…" if at + len(form) + 70 < len(text) else "")}))
    return out


# ---- Text read off the image ---------------------------------------------------------------------

READING = re.compile(r"[Cc]aption|[Ss]tamp|[Ii]nscri|[Ww]atermark|[Hh]andwrit|[Ss]ignature|[Ss]igned|"
                     r"\b(?:Label|Labels|Plate|Badge|Flag|Banner|Arch|Blade|Handle|Mount|Back of the card|Mirror text|Printed text)\b|"
                     r"\b(?:label|plate|badge|flag|banner|arch|blade|handle|mount|card|certificate|text) reads\b")
# Not a reading of this photo: another photo's caption ("Same photograph as ID 1029, which has a
# caption..."), or the file's name.
NOT_READING = re.compile(r"\bID \d+|file name|in English:|\b(field|[Tt]itle|[Nn]otes) (reads|says|spells)|^Names field|^Title reads|^Photographer field|^Locality field")
QUOTE = re.compile(r'"([^"]{2,})"|“([^”]{2,})”')
# How sure the drafting was, from the wording of its note.
UNSURE = re.compile(r"partly|partial|unclear|illegib|not legible|hard to read|faint|possibly|probably|perhaps|"
                    r"looks like|seems|appears to|may read|might|uncertain|cannot|can.t read|not sure|damaged|cut off|cropped", re.I)
CONFLICT = re.compile(r"but (the )?(date|names?|title|photographer|locality|region|year)|field has|sheet has|sheet says|"
                      r"Which (year|spelling|date|name)|does not match|disagree|instead of", re.I)
ALREADY = re.compile(r"[Mm]atches the (notes|description|title)|already in the (notes|description)")
# Where a reading may already be, word for word or translated.
TEXT_COLUMNS = ["Photo description", "AI Generated Description", "Ar_Description", "Cir_Description",
                "Rus_Description", "Tur_Description", "Photo title", "Names of personas"]
# The page's sections, most attention first.
SECTIONS = {
    "unsure": "Part of it could not be read: check it against the photo.",
    "conflict": "The text on the photo disagrees with the sheet: say which is right.",
    "none": "The sheet says this photo has no text, but text was found on it.",
    "clear": "A clear reading of text that is not in the sheet yet.",
}


def words_of(text):
    return {w.lower() for w in re.findall(r"[^\W_]{3,}", text)}


def in_descriptions(reading, note, haystack):
    """True when the sheet already has the reading: most of its words in a description, or most
    words of the translation the drafting gave in brackets ("Circassians sent to the ... War")."""
    have = words_of(haystack)
    own = words_of(reading)
    if own and len(own & have) / len(own) >= 0.7:
        return True
    for gloss in re.findall(r"\(([^)]{6,})\)", note):
        g = words_of(gloss)
        if len(g) >= 3 and len(g & have) / len(g) >= 0.6:
            return True
    return bool(ALREADY.search(note))


def kind_of(text):
    t = text.lower()
    if "watermark" in t:
        return "Watermark"
    if re.search(r"caption|mount|back of the card|handwrit|stamp|sidenote|dedication", t):
        return "Sidenote"
    return "Script"


def languages_in(text, quotes):
    found = []
    joined = " ".join(quotes)
    hints = [("Ottoman Turkish", "Turkish"), ("Turkish", "Turkish"), ("Hungarian", "Hungarian"), ("German", "German"),
             ("Latin", "Latin"), ("French", "French"), ("Georgian", "Georgian"), ("Circassian", "Circassian")]
    if re.search(r"[Ѐ-ӿ]", joined):
        found.append("Russian")
    if re.search(r"[؀-ۿ]", joined) and "Ottoman" not in text:
        found.append("Arabic")
    if re.search(r"[Ⴀ-ჿ]", joined):
        found.append("Georgian")
    for word, lang in hints:
        if re.search(rf"\b{word}\b (caption|line|text|labels?|title|handwrit)|in {word}\b|\({word}\)", text) and lang not in found:
            found.append(lang)
    if re.search(r"[A-Za-z]{3}", joined) and not set(found) - {"Russian", "Arabic", "Georgian"}:
        if re.search(r"\b(le|la|les|du|des|par|ou|dans|de|escadron|groupement|tcherkess)\b|[éèàç]", joined, re.I):
            found.append("French")
        elif re.search(r"\b(the|of|and|from|with)\b|^[A-Z .,']+$", joined):
            found.append("English")
    return found


def readings(sheet):
    """Readings from the drafts: one row per reading to confirm, plus the inscription fields of
    the photo when the readings show they are empty or incomplete."""
    by_photo = defaultdict(list)
    for drafts in sorted(BATCHES.glob("*/drafts.json")):
        if drafts.parent.name.startswith(("test-", "ready-", "stories-ready")):
            continue
        for d in json.loads(drafts.read_text(encoding="utf-8"))["drafts"]:
            for c in d.get("checks", []):
                text = c if isinstance(c, str) else c["text"]
                found = READING.search(text)
                if not found or NOT_READING.search(text):
                    continue
                # Only quotes from the keyword on: earlier ones are the draft's words ("At a graduation" comes from the caption: "...").
                quotes = [a or b for a, b in QUOTE.findall(text[found.start():])]
                if not quotes:
                    continue
                pid = str(d["id"])
                if text not in [t for t, _ in by_photo[pid]]:
                    by_photo[pid].append((text, quotes))
    out = []
    s = sheet
    notes_col, type_col, lang_col = s.col["notes"], s.col["inscription"], s.col["language"]
    text_cols = [column_for(s.names, c) for c in TEXT_COLUMNS]
    for pid, items in sorted(by_photo.items(), key=lambda kv: int(kv[0])):
        p = s.by_id.get(pid)
        if not p:
            continue
        haystack = " ".join(p["cells"].get(c, "") for c in text_cols)
        current_type, current_lang = s.get(p, "inscription"), s.get(p, "language")
        marked_none = current_type in ("", "None")
        found = []
        for text, quotes in items:
            reading = " / ".join(quotes)
            already = in_descriptions(reading, text, haystack)
            if already and not marked_none:
                continue  # the researcher has it: done
            sure = "unsure" if UNSURE.search(text) or "?" in reading or "…" in reading or "..." in reading \
                else "conflict" if CONFLICT.search(text) else "clear"
            found.append((text, quotes, reading, already, sure))
        if not found:
            continue
        sures = {f[4] for f in found}
        section = "unsure" if "unsure" in sures else "conflict" if "conflict" in sures else "none" if marked_none else "clear"
        check = {"id": f"photo-{pid}", "question": SECTIONS[section],
                 "hint": "Confirm each reading, or correct it. A confirmed reading is added to the Photo description, as the sheet's help asks."}
        kinds, langs = [], []
        for text, quotes, reading, already, sure in found:
            ref = hashlib.sha1(text.encode()).hexdigest()[:8]
            out.append(row(s, p, "text", check, notes_col, "", reading, op="append", ref=ref,
                           context={"note": text, "alreadyInNotes": already, "kind": kind_of(text),
                                    "section": section, "sure": sure}))
            kinds.append(kind_of(text))
            langs += [l for l in languages_in(text, quotes) if l not in langs]
        # The inscription fields the researcher filled in are taken as done; only empty ones are proposed.
        want = sorted(set(kinds) - {"Watermark"})
        suggested = "Both" if len(want) > 1 else want[0] if want else "Watermark"
        if marked_none:
            fields = dict(check, options=INSCRIPTION_TYPES)
            out.append(row(s, p, "text", fields, type_col, current_type, suggested, ref="type",
                           context={"field": True, "section": section}))
        if langs and current_lang.strip() in ("", "None"):
            fields = dict(check, options=LANGUAGES)
            out.append(row(s, p, "text", fields, lang_col, current_lang, ", ".join(langs), ref="language",
                           context={"field": True, "section": section}))
    return out


# ---- Records -------------------------------------------------------------------------------------

def records(sheet, checks):
    """{photo id: {label: value}} for the photos the record-showing pages ask about. A snapshot of
    the same export as the checks, so the web app never has to read the Main tab."""
    s = sheet
    columns = [(label, [column_for(s.names, c) for c in starts]) for label, starts in RECORD]
    out = {}
    for pid in dict.fromkeys(str(c["id"]) for c in checks if c["page"] in RECORD_PAGES):
        p = s.by_id.get(pid)
        if not p:
            continue
        rec = {}
        for label, cols in columns:
            values = [p["cells"].get(c, "") for c in cols]
            values = [v for v in dict.fromkeys(values) if v and v.lower() not in ("nan", "none")]
            if values:
                rec[label] = (" · " if label == "Source" else ", ").join(values)
        out[pid] = rec
    return out


# ---- Commands ---------------------------------------------------------------------------------------

def build():
    path = latest_master()
    sheet = Sheet(path)
    checks = rules(sheet) + spelling(sheet) + readings(sheet)
    QUALITY.mkdir(parents=True, exist_ok=True)
    out = QUALITY / "checks.json"
    out.write_text(json.dumps({"source": path.name, "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "checks": checks, "records": records(sheet, checks)}, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    print(f"{len(checks)} possible changes from {path.name} -> {out}")
    for page in ("rules", "spelling", "text"):
        rows = [c for c in checks if c["page"] == page]
        groups = Counter(c["check"] for c in rows)
        print(f"  {page}: {len(rows)} rows in {len(groups)} checks, {len({c['id'] for c in rows})} photos")
        if page == "rules":
            for g, n in groups.items():
                print(f"    {g}: {n}")
    return checks


def load(part="checks"):
    return json.loads((QUALITY / "checks.json").read_text(encoding="utf-8")).get(part, {})


def push():
    checks = load()
    body = {"key": key(), "action": "syncChecks", "checks": checks, "records": load("records")}
    result = call(urllib.request.Request(endpoint(), data=json.dumps(body).encode("utf-8"), method="POST"))
    print(f"Data checks tab: {result['added']} added, {result['removed']} removed (no longer apply), "
          f"{result['kept']} already there. {result.get('records', 0)} photo records for the spelling page.")


def sample():
    SAMPLE.parent.mkdir(parents=True, exist_ok=True)
    SAMPLE.write_text(json.dumps({"checks": load(), "records": load("records")}, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote the demo data to {SAMPLE}")


def final_value(r, current):
    """The new cell value a decided row asks for, from the cell as it is now."""
    final = r.get("final", "")
    if r["op"] == "replace":
        return re.sub(r"(?<!\w)" + re.escape(r["match"]) + r"(?!\w)", lambda m: final, current)
    if r["op"] == "append":
        kind = json.loads(r.get("context") or "{}").get("kind", "Script")
        label = {"Sidenote": "Caption", "Watermark": "Watermark"}.get(kind, "Text on the photo")
        return (current.rstrip() + "\n\n" if current.strip() else "") + f'{label}: "{final}"'
    return final


def pull():
    result = call(urllib.request.Request(endpoint() + "?" + urllib.parse.urlencode({"key": key(), "action": "checks"})))
    rows = result["checks"]
    QUALITY.mkdir(parents=True, exist_ok=True)
    (QUALITY / "decisions.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    write_changes(rows)


def write_changes(rows):
    """describe/quality/changes.csv from the decided rows, checked against the latest export."""
    sheet = Sheet(latest_master())
    stale = 0
    # Several decisions can touch one cell (a reading appended, a spelling replaced): apply in order.
    cells = {}
    # Whole-cell values first, then the replacements and additions inside them, so a name fixed in a
    # title survives the title's own change.
    for r in sorted(rows, key=lambda r: r["op"] != "set"):
        if r.get("decision") != "change":
            continue
        p = sheet.by_id.get(str(r["id"]))
        now = p["cells"].get(r["column"], "") if p else ""
        k = (str(r["id"]), r["column"])
        before = cells.get(k, {}).get("new", now)
        ok = r["op"] != "set" or (now == r["current"] and k not in cells)
        if r["op"] == "append" and json.loads(r.get("context") or "{}").get("alreadyInNotes") and r["final"] == r["proposed"]:
            continue  # the reading is already in the description
        new = final_value(r, before)
        if new == before:
            continue
        entry = cells.setdefault(k, {"id": r["id"], "letter": r["letter"], "column": r["column"], "old": now,
                                     "notes": [], "stale": False})
        entry["new"] = new
        entry["notes"].append(r.get("note", "") or r["question"])
        entry["stale"] = entry["stale"] or not ok
        stale += not ok
    changes = sorted(cells.values(), key=lambda c: (int(c["id"]), c["letter"]))
    out = QUALITY / "changes.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as f:  # BOM: Excel and Sheets read the Arabic right
        w = csv.writer(f)
        w.writerow(["id", "column letter", "column", "old value", "new value", "why", "warning"])
        for c in changes:
            w.writerow([c["id"], c["letter"], c["column"], c["old"], c["new"], " · ".join(dict.fromkeys(c["notes"])),
                        "the cell changed after the check was made, or two checks set it: check by hand" if c["stale"] else ""])
    decided = sum(1 for r in rows if r.get("decision"))
    print(f"{decided} of {len(rows)} checks decided. {len(changes)} cells to change -> {out}")
    if stale:
        print(f"  {stale} of them changed in the sheet since the check was made: marked in the warning column")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    {"build": build, "push": push, "pull": pull, "sample": sample}.get(command, lambda: sys.exit(__doc__))()
