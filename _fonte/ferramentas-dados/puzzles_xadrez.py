"""Gera os dados da página /jogos/puzzles-de-xadrez/: os blocos de puzzles e o sprite das peças.

Uso, na raiz do repositório:

    python -I _fonte/ferramentas-dados/puzzles_xadrez.py
    python -I _fonte/ferramentas-dados/puzzles_xadrez.py --puzzles <pasta> --pecas <pasta>

Puzzles
    Lê a coleção de 50 mil puzzles do app Puzzles de Xadrez (catalog.json + part-NN.json em
    app/src/main/assets/puzzles do projeto puzzleschesstrainer). Essa coleção é uma seleção do banco
    aberto de puzzles do Lichess (https://database.lichess.org/#puzzles), que é CC0 (domínio público);
    o Lance Certo traz a mesma seleção. Cada linha do app é `id|FEN|lances UCI|rating|jogadas|temas`.

    O site leva só um subconjunto: até POR_FAIXA puzzles em cada faixa de 100 pontos de rating
    (abaixo de 500 e a partir de 2800 viram uma faixa só cada). Em cada faixa, primeiro entram puzzles
    dos temas mais raros, até cada tema ter MINIMO_POR_TEMA puzzles ali (quando existem), e o resto é
    sorteado. A semente é fixa, então rodar de novo com a mesma coleção gera os mesmos arquivos.

    Saída em assets/jogos/puzzles-de-xadrez/:
      indice.json         faixas (arquivo, hash, rating mínimo e máximo, contagem por tema) e totais
      blocos/rNNNN.json   lista de linhas `id|FEN|lances UCI|rating|temas` (sem o número de jogadas)

    A página baixa o índice e depois só os blocos das faixas perto do rating procurado.
    O teste _fonte/testes/puzzles-de-xadrez.test.js joga a solução de todos os puzzles gerados.

Peças
    Converte os VectorDrawables do conjunto cburnett usados no Lance Certo
    (ChessTrainer/core/ui/src/main/res/drawable/piece_*.xml) num sprite SVG com um <symbol> por peça,
    em assets/jogos/puzzles-de-xadrez/pecas.svg, com o aviso da licença BSD que o Lance Certo usa.
    Se a pasta não existir, o sprite atual fica como está.
"""
import argparse
import datetime
import hashlib
import json
import random
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
SAIDA = RAIZ / "assets" / "jogos" / "puzzles-de-xadrez"
PUZZLES_APP = Path(r"D:\KotlinProjetos\puzzleschesstrainer\app\src\main\assets\puzzles")
PECAS_APP = Path(r"D:\KotlinProjetos\ChessTrainer\core\ui\src\main\res\drawable")

SEMENTE = 20261103
POR_FAIXA = 400
MINIMO_POR_TEMA = 6
FAIXA_MINIMA = 400  # ratings abaixo de 500 entram na faixa 400
FAIXA_MAXIMA = 2800  # ratings de 2800 para cima entram na faixa 2800

LICENCA_PECAS = """Peças de xadrez: conjunto cburnett, de Colin M.L. Burnett, o mesmo do app Lance Certo
(arquivos core/ui/src/main/res/drawable/piece_*.xml, vindos de public/piece/cburnett do lichess-org/lila).
O autor publicou os desenhos no Wikimedia Commons sob GFDL, BSD, GPL e CC BY-SA, à escolha de quem usa;
aqui, como no Lance Certo, vale a licença BSD de 3 cláusulas abaixo. Convertidos de VectorDrawable para SVG
por _fonte/ferramentas-dados/puzzles_xadrez.py, com o mesmo desenho (a torre preta tem um friso claro só
abaixo do corpo, como no Lance Certo).

The cburnett chess pieces

Copyright Colin M.L. Burnett, with contributions from other Wikipedia users.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote
products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
"""


# ---------- Puzzles ----------


def ler_colecao(pasta: Path) -> tuple[str, list[dict]]:
    catalogo = json.loads((pasta / "catalog.json").read_text(encoding="utf-8"))
    puzzles = []
    for parte in sorted(pasta.glob("part-*.json")):
        for linha in json.loads(parte.read_text(encoding="utf-8")):
            campos = linha.split("|")
            if len(campos) != 6:
                raise SystemExit(f"{parte.name}: linha inválida: {linha}")
            pid, fen, lances, rating, _jogadas, temas = campos
            if len(lances.split()) < 2 or len(lances.split()) % 2:
                raise SystemExit(f"{parte.name}: puzzle {pid} com número de lances inválido")
            puzzles.append(
                {"id": pid, "fen": fen, "lances": lances, "rating": int(rating), "temas": temas.split()}
            )
    if len(puzzles) != catalogo["count"]:
        raise SystemExit(f"Esperava {catalogo['count']} puzzles, li {len(puzzles)}")
    return catalogo["version"], puzzles


def faixa(rating: int) -> int:
    return min(FAIXA_MAXIMA, max(FAIXA_MINIMA, rating // 100 * 100))


def escolher(puzzles: list[dict], sorteio: random.Random) -> dict[int, list[dict]]:
    raridade = Counter(t for p in puzzles for t in p["temas"])
    temas_por_raridade = sorted(raridade, key=lambda t: (raridade[t], t))
    por_faixa: dict[int, list[dict]] = {}
    for p in sorted(puzzles, key=lambda p: p["id"]):
        por_faixa.setdefault(faixa(p["rating"]), []).append(p)

    escolhidos: dict[int, list[dict]] = {}
    for chave in sorted(por_faixa):
        disponiveis = por_faixa[chave][:]
        sorteio.shuffle(disponiveis)
        selecionados: list[dict] = []
        usados: set[str] = set()
        contagem: Counter = Counter()

        def pegar(p: dict) -> None:
            selecionados.append(p)
            usados.add(p["id"])
            contagem.update(p["temas"])

        # Primeiro os temas raros, para todo tema ter alguns puzzles em cada faixa
        for tema in temas_por_raridade:
            for p in disponiveis:
                if len(selecionados) >= POR_FAIXA or contagem[tema] >= MINIMO_POR_TEMA:
                    break
                if p["id"] not in usados and tema in p["temas"]:
                    pegar(p)
        for p in disponiveis:
            if len(selecionados) >= POR_FAIXA:
                break
            if p["id"] not in usados:
                pegar(p)
        escolhidos[chave] = sorted(selecionados, key=lambda p: (p["rating"], p["id"]))
    return escolhidos


def gravar_json(caminho: Path, dados) -> bytes:
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":")) + "\n"
    conteudo = texto.encode("utf-8")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(conteudo)
    return conteudo


def gerar_puzzles(pasta: Path) -> None:
    versao, puzzles = ler_colecao(pasta)
    escolhidos = escolher(puzzles, random.Random(SEMENTE))
    pasta_blocos = SAIDA / "blocos"
    for antigo in pasta_blocos.glob("r*.json"):
        antigo.unlink()

    blocos = []
    total_temas: Counter = Counter()
    total = 0
    tamanho = 0
    for chave, lista in escolhidos.items():
        linhas = [f"{p['id']}|{p['fen']}|{p['lances']}|{p['rating']}|{' '.join(p['temas'])}" for p in lista]
        nome = f"blocos/r{chave:04d}.json"
        conteudo = gravar_json(SAIDA / nome, linhas)
        tamanho += len(conteudo)
        temas = Counter(t for p in lista for t in p["temas"])
        total_temas.update(temas)
        total += len(lista)
        blocos.append(
            {
                "arquivo": nome,
                "v": hashlib.sha1(conteudo).hexdigest()[:10],
                "min": lista[0]["rating"],
                "max": lista[-1]["rating"],
                "total": len(lista),
                "temas": dict(sorted(temas.items())),
            }
        )

    indice = {
        "formato": 1,
        "fonte": "Banco aberto de puzzles do Lichess, https://database.lichess.org/#puzzles",
        "licenca": "CC0-1.0",
        "colecao": f"Seleção de 50 mil puzzles dos apps Puzzles de Xadrez e Lance Certo, versão {versao}",
        "gerado": datetime.date.today().isoformat(),
        "semente": SEMENTE,
        "total": total,
        "temas": dict(sorted(total_temas.items())),
        "blocos": blocos,
    }
    tamanho += len(gravar_json(SAIDA / "indice.json", indice))
    print(f"{total} puzzles em {len(blocos)} blocos, {tamanho / 1024:.0f} KB com o índice")


# ---------- Peças ----------

ANDROID = "{http://schemas.android.com/apk/res/android}"
NOMES_PECAS = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]


def cor(valor: str) -> str:
    """#AARRGGBB do Android para #rrggbb (as peças só usam cores opacas)."""
    valor = valor.strip()
    if not re.fullmatch(r"#FF[0-9A-Fa-f]{6}", valor):
        raise SystemExit(f"Cor não suportada: {valor}")
    return "#" + valor[3:].lower()


def simbolo(arquivo: Path, nome: str) -> str:
    raiz = ET.parse(arquivo).getroot()
    largura = raiz.get(f"{ANDROID}viewportWidth")
    altura = raiz.get(f"{ANDROID}viewportHeight")
    caminhos = []
    for el in raiz:
        if el.tag != "path":
            raise SystemExit(f"{arquivo.name}: elemento não suportado <{el.tag}>")
        a = lambda chave: el.get(f"{ANDROID}{chave}")  # noqa: E731
        attrs = [f'd="{a("pathData")}"']
        attrs.append(f'fill="{cor(a("fillColor"))}"' if a("fillColor") else 'fill="none"')
        if a("fillColor") and a("fillType") == "evenOdd":
            attrs.append('fill-rule="evenodd"')
        if a("strokeColor"):
            attrs.append(f'stroke="{cor(a("strokeColor"))}"')
            attrs.append(f'stroke-width="{a("strokeWidth") or "1"}"')
            attrs.append(f'stroke-linecap="{(a("strokeLineCap") or "butt").lower()}"')
            attrs.append(f'stroke-linejoin="{(a("strokeLineJoin") or "miter").lower()}"')
        caminhos.append(f"    <path {' '.join(attrs)}/>")
    corpo = "\n".join(caminhos)
    return f'  <symbol id="{nome}" viewBox="0 0 {largura} {altura}">\n{corpo}\n  </symbol>'


def gerar_pecas(pasta: Path) -> None:
    if not pasta.is_dir():
        print(f"Pasta das peças não encontrada ({pasta}); pecas.svg não foi refeito")
        return
    simbolos = [simbolo(pasta / f"piece_{nome.lower()}.xml", nome) for nome in NOMES_PECAS]
    aviso = LICENCA_PECAS.replace("--", "- -").strip()
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<!--\n{aviso}\n-->\n"
        '<svg xmlns="http://www.w3.org/2000/svg">\n' + "\n".join(simbolos) + "\n</svg>\n"
    )
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "pecas.svg").write_text(svg, encoding="utf-8", newline="\n")
    (SAIDA / "LICENCA-pecas.txt").write_text(LICENCA_PECAS, encoding="utf-8", newline="\n")
    print(f"pecas.svg com {len(simbolos)} peças")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--puzzles", type=Path, default=PUZZLES_APP, help="pasta com catalog.json e part-NN.json")
    parser.add_argument("--pecas", type=Path, default=PECAS_APP, help="pasta com os piece_*.xml do Lance Certo")
    args = parser.parse_args()
    gerar_puzzles(args.puzzles)
    gerar_pecas(args.pecas)


if __name__ == "__main__":
    main()
