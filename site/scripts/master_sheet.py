"""Read the archive master sheet (PhotoArchive_Master_Sheet*.xlsx) by column name.

The master sheet has 112 columns in groups (File, Source, Photo Properties, Photo Content,
Category, Output…). Row 1 numbers the columns, row 2 names the groups, row 3 holds the column
names, row 4 the help notes, and the photos start on row 5. Columns are found by their name in
row 3, so they can be moved or added without breaking this.

    from master_sheet import read_master, latest_master
    photos = read_master(latest_master())

Each photo is a dict with the keys of FIELDS, plus "context": the filled-in category
descriptions (place, ritual, art, dance…), keyed by category.
"""

from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

HEADER_ROW, FIRST_DATA_ROW = 3, 5

# key -> column name in row 3 (first line of the cell, compared without case or extra spaces).
# A name ending in "*" matches any column that starts with it.
FIELDS = {
    "id": "File ID",
    "status": "Status",
    "fileLink": "File Link",
    "museum": "Museum description",
    "book": "Book Desctription",  # sic, as in the sheet
    "collection": "Personal Collection Description",
    "website": "Website URL",
    "dateTaken": "Date taken (year)",
    "dateType": "Date type",
    "photographer": "Photographer",
    "period": "Historic period",
    "location": "Location",
    "countryCode": "Country code",
    "country": "Country",
    "region": "Region",
    "locality": "Locality",
    "sublocality": "Sub-Locality",
    "personasKnown": "Are personas known?",
    "names": "Names of personas*",
    "tribe": "Tribe",
    "dignitaries": "Dignitaries name(s)",
    "dignitaryBorn": "Dignitary born (year)",
    "dignitaryDied": "Dignitary died (year)",
    "artType": "Art type",
    "artDate": "Date",
    "artOwner": "Owner",
    "creator": "Creator",
    "inscription": "Script, Sidenote",
    "inscriptionLanguage": "Script, Sidenote Language",
    "keywords": "Keywords*",
    "originalNames": "Original names",
    "title": "Photo title",
    "notes": "Photo description",  # the researcher's long description: the main source for drafts
    "description": "AI Generated Description*",  # the text shown on the website
    "finalLink": "Final file link",
    "s3": "Final file S3",
    "circassian": "100% Circassian",
    "credible": "Credible Photo",
    "titleApproved": "Photo Title Approved",
    "ready": "Description ready",
    "suggestions": "Suggestions",
}

# Category description columns: included as context when filled in.
CONTEXT = {
    "Ornaments description": "ornaments", "Place description": "place",
    "Archeology description": "archaeology", "House descdription": "house",
    "Rituals description": "ritual", "Art description": "art", "Fashion description": "fashion",
    "Sport description": "sport", "Dance description": "dance",
    "Musical performance description": "music", "Book cover description": "book cover",
    "Musical instrument description": "instrument", "Mythology description": "mythology",
    "Horses description": "horses", "Map description": "map", "Other description": "other",
}

UNKNOWN = {"", "nan", "none", "unknown", "n/a"}


def text(value):
    """Cell value as trimmed text; 'nAn', 'Unknown' and empty cells become ''."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    value = " ".join(str(value).split())
    return "" if value.lower() in UNKNOWN else value


def is_true(value):
    return str(value).strip().lower() == "true"


def country_name(value):
    """'RF – Kabardino-Balkaria' -> 'Kabardino-Balkaria'; 'Russian Federation' -> 'Russia'."""
    value = text(value)
    for prefix in ("RF – ", "RF - "):
        if value.startswith(prefix):
            return value[len(prefix):]
    return {"Russian Federation": "Russia"}.get(value, value)


def _name(cell):
    return " ".join(str(cell or "").split("\n")[0].split()).lower()


def _columns(header):
    names = [_name(c) for c in header]
    cols = {}
    for key, wanted in FIELDS.items():
        prefix = wanted.endswith("*")
        w = wanted.rstrip("*").lower()
        matches = [i for i, n in enumerate(names) if (n.startswith(w) if prefix else n == w)]
        if not matches:
            raise KeyError(f'Column "{wanted}" not found in row {HEADER_ROW} of the Main tab')
        cols[key] = matches[0]
    context = {label: names.index(name.lower()) for name, label in CONTEXT.items() if name.lower() in names}
    return cols, context


def latest_master():
    files = sorted(DATA.glob("PhotoArchive_Master_Sheet*.xlsx"), key=lambda p: p.stat().st_mtime)
    if not files:
        raise SystemExit(f"No PhotoArchive_Master_Sheet*.xlsx in {DATA}")
    return files[-1]


def read_master(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = workbook["Main"].iter_rows(values_only=True)
    header = None
    for n, row in enumerate(rows, start=1):
        if n == HEADER_ROW:
            header = row
            cols, context_cols = _columns(header)
        if n < FIRST_DATA_ROW or not text(row[cols["id"]]):
            continue
        photo = {key: text(row[i]) for key, i in cols.items()}
        photo["id"] = int(float(photo["id"]))
        photo["country"] = country_name(row[cols["country"]])
        for flag in ("circassian", "credible", "titleApproved", "ready"):
            photo[flag] = is_true(row[cols[flag]])
        photo["context"] = {label: text(row[i]) for label, i in context_cols.items() if text(row[i])}
        yield photo
