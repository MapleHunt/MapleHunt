"""Turn the Ontario Hunting Regulations Summary PDF into reg_chunks rows.

Usage (from the repo root, needs `pip install pymupdf`):
    python pipeline/regs_to_sql.py pipeline/data/regs/regs-2026.pdf 2026 > pipeline/data/regs/reg_chunks.sql
Then run reg_chunks.sql in the Supabase SQL Editor. It replaces that season's rows.

Each chunk is ~1,000 characters from one page, built from whole text blocks.
Headings are found from font size / bold, and kept as `section` so the assistant
can cite "Party Hunting · p. 32". `page` is the printed page number
(PDF page minus PAGE_OFFSET), matching the summary's own cross-references.
"""

import re
import statistics
import sys

import pymupdf

SOURCE = "https://www.ontario.ca/document/ontario-hunting-regulations-summary"
TARGET = 1000  # characters per chunk
# Printed page = PDF page - 2 in the 2026 summary (two cover pages). Check this for other editions.
PAGE_OFFSET = 2
RUNNING_HEADER = re.compile(r"^hunting regulations summary\s+\d{4}", re.I)


def sql_text(s: str | None) -> str:
    return "null" if s is None else "'" + s.replace("'", "''") + "'"


def blocks(page):
    """Yield (text, max_font_size, is_bold) for each text block on the page."""
    for b in page.get_text("dict")["blocks"]:
        spans = [s for line in b.get("lines", []) for s in line["spans"] if s["text"].strip()]
        if not spans:
            continue
        text = " ".join(" ".join(s["text"] for s in line["spans"]).strip() for line in b["lines"])
        text = re.sub(r"\.{4,}", " ", text)  # dotted leaders
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            yield text, max(s["size"] for s in spans), all(s["flags"] & 16 or "Bold" in s["font"] for s in spans)


def main() -> None:
    path, season = sys.argv[1], int(sys.argv[2])
    doc = pymupdf.open(path)

    sizes = [round(size, 1) for page in doc for _, size, _ in blocks(page)]
    body = statistics.median(sizes)

    rows = []
    section = None
    for number, page in enumerate(doc, start=1):
        buf: list[str] = []

        def flush():
            text = " ".join(buf).strip()
            if len(text) >= 80:
                rows.append((section, text, max(1, number - PAGE_OFFSET)))
            buf.clear()

        for text, size, bold in blocks(page):
            if RUNNING_HEADER.match(text) or re.fullmatch(r"\d{1,3}", text):
                continue
            heading = len(text) <= 90 and (size >= body * 1.25 or (bold and size >= body and not text.endswith(".")))
            if heading:
                flush()
                section = text
                continue
            buf.append(text)
            if sum(len(t) for t in buf) >= TARGET:
                flush()
        flush()

    print("begin;")
    print(f"delete from public.reg_chunks where season_year = {season};")
    for sec, text, page in rows:
        print(
            "insert into public.reg_chunks (season_year, section, body, source_url, page) values "
            f"({season}, {sql_text(sec)}, {sql_text(text)}, {sql_text(SOURCE)}, {page});"
        )
    print("commit;")
    print(f"-- {len(rows)} chunks from {len(doc)} pages (body font {body}pt)", file=sys.stderr)


if __name__ == "__main__":
    main()
