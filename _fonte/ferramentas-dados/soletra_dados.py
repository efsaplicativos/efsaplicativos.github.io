# -*- coding: utf-8 -*-
"""
Gera assets/jogos/soletra-dados.js: dicionário grande de Soletra e as rodadas prontas.

Fontes (ambas MIT, do repositório fserb/pt-br, o mesmo já usado pelo Desvenda):
  - lexico: 145.744 palavras do português
  - icf:    índice de frequência (quanto menor, mais comum a palavra)
Baixa as duas, fica só com as palavras comuns de 3 a 8 letras, sem acento, e monta as rodadas
(sete letras + letra do meio) que rendem entre MIN e MAX palavras.
"""
import random
import re
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "assets" / "jogos" / "soletra-dados.js"
CACHE = Path.home() / "AppData" / "Local" / "Temp" / "efs-soletra"
BASE = "https://raw.githubusercontent.com/fserb/pt-br/master/"

MIN_LETRAS, MAX_LETRAS = 4, 8
MIN_PALAVRAS, MAX_PALAVRAS = 12, 60
ALVO = 25
MIN_DISTINTAS = 5
TOTAL_RODADAS = 220
ALVO_DICIONARIO = 9000
COMPLEMENTO = "SRAEIOUTMLCDPNVBGFZ"


def baixar(nome):
    CACHE.mkdir(parents=True, exist_ok=True)
    destino = CACHE / nome.replace("/", "-")
    if not destino.exists():
        url = BASE + urllib.parse.quote(nome)
        requisicao = urllib.request.Request(url, headers={"User-Agent": "efs-aplicativos/1.0"})
        with urllib.request.urlopen(requisicao, timeout=120) as resposta:
            destino.write_bytes(resposta.read())
    return destino.read_text(encoding="utf-8", errors="replace")


def sem_acento(texto):
    decomposto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn").upper()


import urllib.parse  # noqa: E402  (usado em baixar)

lexico = {sem_acento(l.strip()) for l in baixar("lexico").splitlines() if l.strip()}
lexico = {p for p in lexico if re.fullmatch(r"[A-Z]{%d,%d}" % (MIN_LETRAS, MAX_LETRAS), p)}
print("lexico:", len(lexico), "palavras de", MIN_LETRAS, "a", MAX_LETRAS, "letras")

# ---- Filtros de qualidade ----
# 1) Lista "aceitas" do Desvenda (é só de 5 letras e vem concatenada, sem separador)
texto_desvenda = (RAIZ / "assets" / "jogos" / "desvenda-palavras.js").read_text(encoding="utf-8")
bruto_aceitas = re.search(r'["\']?aceitas["\']?\s*:\s*"([^"]*)"', texto_desvenda)
aceitas = set()
if bruto_aceitas:
    texto = bruto_aceitas.group(1).upper()
    aceitas = {texto[i:i + 5] for i in range(0, len(texto) - 4, 5)}
aceitas = {p for p in aceitas if re.fullmatch(r"[A-Z]{5}", p)}
print("aceitas do Desvenda:", len(aceitas), "palavras de 5 letras")

# 2) Palavras negativas do repositório (o site é família: nada de palavrão no jogo)
negativas = {sem_acento(l.strip()) for l in baixar("listas/negativas").splitlines() if l.strip()}
negativas = {p for p in negativas if p}

# 2b) Lista de bloqueio do próprio projeto: estrangeirismo e nome próprio que a frequência deixou passar
bloqueio = RAIZ / "_fonte" / "ferramentas-dados" / "soletra_bloqueadas.txt"
if bloqueio.exists():
    for linha in bloqueio.read_text(encoding="utf-8").splitlines():
        limpa = linha.split("#", 1)[0].strip()
        if limpa:
            negativas.add(sem_acento(limpa))
print("palavras negativas + bloqueadas:", len(negativas))

# 3) Quanto mais curta a palavra, mais fácil de entrar ruído: limite de frequência mais rígido
LIMITE_POR_TAMANHO = {4: 12.5, 5: 13.5, 6: 13.5, 7: 14.0, 8: 14.0}


def aceitavel(palavra, indice):
    if palavra in negativas:
        return False
    if len(palavra) == 5 and aceitas and palavra not in aceitas:
        return False
    return indice <= LIMITE_POR_TAMANHO.get(len(palavra), 13.5)

frequencia = {}
for linha in baixar("icf").splitlines():
    if "," not in linha:
        continue
    palavra, _, indice = linha.rpartition(",")
    try:
        valor = float(indice)
    except ValueError:
        continue
    normalizada = sem_acento(palavra.strip())
    if normalizada in lexico:
        frequencia[normalizada] = min(valor, frequencia.get(normalizada, valor))

palavras = {p for p in lexico if p in frequencia and aceitavel(p, frequencia[p])}
print("depois dos filtros:", len(palavras), "palavras")
por_tamanho = {}
for p in palavras:
    por_tamanho[len(p)] = por_tamanho.get(len(p), 0) + 1
print("por tamanho:", dict(sorted(por_tamanho.items())))
limite = 13.5

import itertools  # noqa: E402

lista = sorted(palavras)
mascaras = {}
for palavra in lista:
    m = 0
    for letra in palavra:
        m |= 1 << (ord(letra) - 65)
    mascaras[palavra] = m

sorteio = random.Random(20260101)
conjuntos = {}


def anotar(letras):
    conjunto = sorted(set(letras))
    if len(conjunto) != 7:
        return
    conjuntos.setdefault("".join(conjunto), conjunto)


for palavra in lista:
    letras = sorted(set(palavra))
    if len(letras) >= 7:
        for combo in itertools.combinations(letras, 7):
            anotar(combo)
    elif len(letras) >= MIN_DISTINTAS:
        extras = []
        guarda = 0
        while len(letras) + len(extras) < 7 and guarda < 500:
            guarda += 1
            letra = COMPLEMENTO[sorteio.randrange(len(COMPLEMENTO))]
            if letra not in letras and letra not in extras:
                extras.append(letra)
        if extras:
            anotar(letras + extras)

print("conjuntos de sete letras:", len(conjuntos))

candidatas = []
for chave, letras in conjuntos.items():
    m = 0
    for letra in chave:
        m |= 1 << (ord(letra) - 65)
    compativeis = [p for p in lista if mascaras[p] & ~m == 0]
    if len(compativeis) < MIN_PALAVRAS:
        continue
    contagens = sorted(((sum(1 for p in compativeis if letra in p), letra) for letra in letras), reverse=True)
    validas = [(n, letra) for n, letra in contagens if MIN_PALAVRAS <= n <= MAX_PALAVRAS]
    if not validas:
        continue
    total, meio = validas[0]
    candidatas.append((abs(total - ALVO), chave, meio, total))

candidatas.sort()
rodadas = []
for _, chave, meio, total in candidatas:
    rodadas.append((chave, meio, total))
    if len(rodadas) >= TOTAL_RODADAS:
        break

print("rodadas geradas:", len(rodadas), "| palavras por rodada:", min(r[2] for r in rodadas), "a", max(r[2] for r in rodadas))

linhas = [
    '"use strict";',
    "/*",
    " * Dados do Soletra, gerados por _fonte/ferramentas-dados/soletra_dados.py — não editar à mão.",
    " *",
    " * Fonte: repositório fserb/pt-br (licença MIT, lista pt-br de Fernando Serboncini): o arquivo",
    " * `lexico` (palavras do português) filtrado pelo `icf` (índice de frequência), para ficarem só as",
    f" * palavras comuns. {len(palavras)} palavras de {MIN_LETRAS} a {MAX_LETRAS} letras, sem acento, mais",
    f" * {len(rodadas)} rodadas prontas (sete letras e a letra do meio) com {MIN_PALAVRAS} a {MAX_PALAVRAS} palavras cada.",
    " */",
    "const SoletraDados = {",
    '  fonte: "fserb/pt-br (MIT): lexico + icf",',
    f"  limite: {limite},",
    "  rodadas: [",
]
for chave, meio, _ in rodadas:
    linhas.append(f'    ["{chave}", "{meio}"],')
linhas.append("  ],")
linhas.append('  palavras: "' + " ".join(lista) + '",')
linhas.append("};")
linhas.append("")
linhas.append('if (typeof module === "object") module.exports = SoletraDados;')
linhas.append("")

SAIDA.write_text("\n".join(linhas), encoding="utf-8")
print("gravado:", SAIDA, "|", SAIDA.stat().st_size, "bytes")
