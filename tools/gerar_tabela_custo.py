"""Generates src/data/custoAte1995.ts from the official copy of the Anexo Unico
of IN SRF 84/2001 (docs/fontes/anexo-unico-in-srf-84-2001.txt, latin-1).

Run from the repository root: python -I tools/gerar_tabela_custo.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "fontes" / "anexo-unico-in-srf-84-2001.txt"
OUT = ROOT / "src" / "data" / "custoAte1995.ts"

# Longest names first so "Cruzeiros Reais" is not read as "Cruzeiros".
# Accents in headings are corrupted in the source, so match by ASCII stem.
MOEDAS = [
    ("Cruzeiros Reais", "Cruzeiros Reais"),
    ("Cruzeiros Novos", "Cruzeiros Novos"),
    ("Cruzados Novos", "Cruzados Novos"),
    ("Cruzeiros", "Cruzeiros"),
    ("Cruzados", "Cruzados"),
    ("Mil-R", "Mil-Réis"),
    ("Reais", "Reais"),
]
MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]


def moeda_of(heading: str):
    # Use the text after the first "expressos em" only (one occurrence).
    tail = heading.split("expressos em", 1)[1].strip() if "expressos em" in heading else heading
    for stem, name in MOEDAS:
        if tail.startswith(stem):
            return name
    raise ValueError(f"unknown moeda: {heading!r}")


def main() -> None:
    lines = SRC.read_text(encoding="latin-1").splitlines()
    table: dict[str, dict[int, list]] = {}
    moeda = None
    years: list[int] = []
    for line in lines:
        if line.startswith("##"):
            moeda = moeda_of(line)
            years = []
        elif line.startswith(" |") and moeda:
            years = [int(y) for y in re.findall(r"\d{4}", line)]
        elif moeda and years and line[:3] in MONTHS:
            m = MONTHS.index(line[:3])
            cells = [c.strip() for c in line.split("|")[1:]]
            assert len(cells) == len(years), line
            for y, c in zip(years, cells):
                arr = table.setdefault(moeda, {}).setdefault(y, [None] * 12)
                if c != "-":
                    v = float(c.replace(",", "."))
                    assert arr[m] is None or arr[m] == v, (moeda, y, m)
                    arr[m] = v

    def num(v):
        return "null" if v is None else repr(v)

    out = [
        "// GENERATED FILE - do not edit by hand.",
        "// Source: Anexo Unico of IN SRF 84/2001 (docs/fontes/anexo-unico-in-srf-84-2001.txt).",
        "// Generator: python -I tools/gerar_tabela_custo.py",
        "// Divide the original value by the index of the month/year of acquisition or payment",
        "// to get the value updated to 31/12/1995 (IN SRF 84/2001, art. 7).",
        "",
        'export type Moeda =',
        '  | "Reais"',
        '  | "Cruzeiros Reais"',
        '  | "Cruzeiros"',
        '  | "Cruzados Novos"',
        '  | "Cruzados"',
        '  | "Cruzeiros Novos"',
        '  | "Mil-Réis";',
        "",
        "// moeda -> year -> 12 monthly indexes (Jan..Dec); null where the table has \"-\".",
        "const TABLE: Record<Moeda, Record<number, (number | null)[]>> = {",
    ]
    for moeda_name in ["Reais", "Cruzeiros Reais", "Cruzeiros", "Cruzados Novos", "Cruzados", "Cruzeiros Novos", "Mil-Réis"]:
        out.append(f"  {json.dumps(moeda_name, ensure_ascii=False)}: {{")
        for y in sorted(table[moeda_name], reverse=True):
            out.append(f"    {y}: [{', '.join(num(v) for v in table[moeda_name][y])}],")
        out.append("  },")
    out += [
        "};",
        "",
        "export function costIndex(moeda: Moeda, year: number, month: number): number | null {",
        "  return TABLE[moeda]?.[year]?.[month - 1] ?? null;",
        "}",
        "",
        "// Every currency with an index for the given month (the table overlaps at currency changes).",
        "export function currenciesFor(year: number, month: number): Moeda[] {",
        "  return (Object.keys(TABLE) as Moeda[]).filter((m) => costIndex(m, year, month) !== null);",
        "}",
        "",
    ]
    OUT.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print("ok", {k: len(v) for k, v in table.items()})


main()
