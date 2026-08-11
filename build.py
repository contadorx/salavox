#!/usr/bin/env python3
"""Monta public/app.html a partir de src/app.html + src/app.js (+ jsPDF quando usado)."""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent

def main() -> int:
    html = (ROOT / "src" / "app.html").read_text(encoding="utf-8")
    js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
    if "/*__APP__*/" not in html:
        print("marcador /*__APP__*/ ausente", file=sys.stderr)
        return 1
    saida = html.replace("/*__APP__*/", js).replace("<script>/*__JSPDF__*/</script>", "")
    # a raiz precisa existir: sem index.html a Vercel devolve 404 no "/"
    destino = ROOT / "public" / "index.html"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(saida, encoding="utf-8")
    print(f"public/index.html  {len(saida)/1024:.1f} KB")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
