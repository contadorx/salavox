#!/usr/bin/env python3
"""Monta public/app.html a partir de src/app.html + src/app.js (+ jsPDF quando usado).

O carimbo de versão existe por um defeito real: o ClipContext ficou semanas no ar
com uma versão antiga do aplicativo enquanto o repositório já tinha a nova, e não
havia como perceber olhando a página. Agora a versão aparece no rodapé da
ferramenta e em /versao.txt — dá para conferir o que está publicado com um curl,
sem abrir o navegador.
"""
import hashlib
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent
FONTES = ["src/app.html", "src/app.js", "src/idiomas.js", "src/en.json",
          "vendor/jspdf.umd.min.js"]


def versao() -> str:
    """data da compilação + impressão digital das fontes.

    A impressão digital vem do conteúdo, não do git: o zip que o Leandro recebe
    não carrega histórico, e mesmo assim precisa ser identificável.
    """
    h = hashlib.sha256()
    for nome in FONTES:
        h.update((ROOT / nome).read_bytes())
    dia = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{dia}.{h.hexdigest()[:7]}"


def main() -> int:
    html = (ROOT / "src" / "app.html").read_text(encoding="utf-8")
    js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
    if "/*__APP__*/" not in html:
        print("marcador /*__APP__*/ ausente", file=sys.stderr)
        return 1

    v = versao()
    lib = (ROOT / "vendor" / "jspdf.umd.min.js").read_text(encoding="utf-8")

    # o dicionário mora em src/en.json e entra no runtime de idiomas; o runtime
    # vai inteiro para dentro da ferramenta e também sai solto em public/, para
    # as páginas que não passam por este build (site, conta, painel).
    idiomas = (ROOT / "src" / "idiomas.js").read_text(encoding="utf-8")
    dic = json.loads((ROOT / "src" / "en.json").read_text(encoding="utf-8"))
    corpo = ",\n".join("    %s: %s" % (json.dumps(k, ensure_ascii=False),
                                       json.dumps(dic[k], ensure_ascii=False))
                       for k in sorted(dic))
    if "/*__DICIONARIO__*/" not in idiomas:
        print("marcador /*__DICIONARIO__*/ ausente", file=sys.stderr)
        return 1
    idiomas = idiomas.replace("    /*__DICIONARIO__*/", corpo)
    (ROOT / "public" / "idiomas.js").write_text(idiomas, encoding="utf-8")

    saida = (html.replace("/*__APP__*/", js)
                 .replace("/*__IDIOMAS__*/", idiomas)
                 .replace("/*__JSPDF__*/", lib)
                 .replace("__VERSAO__", v))

    if "__VERSAO__" in html and v not in saida:
        print("o carimbo de versão não entrou no arquivo", file=sys.stderr)
        return 1

    # a landing fica em public/index.html (escrita à mão); a ferramenta em /app
    destino = ROOT / "public" / "app.html"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(saida, encoding="utf-8")
    (ROOT / "public" / "versao.txt").write_text(v + "\n", encoding="utf-8")

    print(f"public/app.html  {len(saida)/1024:.1f} KB  versão {v}  "
          f"— {len(dic)} textos em inglês")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
