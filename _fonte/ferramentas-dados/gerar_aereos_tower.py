"""Cria as quatro aeronaves com Nano Banana, usando edição por referência.

Uso, na raiz do repositório, com GEMINI_API_KEY no ambiente:
    python _fonte/ferramentas-dados/gerar_aereos_tower.py

O helicóptero normal é gerado e depois editado para remover as pás fixas. As versões destruídas
são edits da aeronave normal correspondente, para manter a mesma silhueta.
"""
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gerar_assets_tower as ga
import imagens_paginas as nano

ESTILO = (
    "Flat 2D cartoon vector game asset matching chunky top-down military tank sprites: one thick "
    "uniform near-black outline around the whole silhouette, large simple flat armor shapes, only "
    "bright red and darker red solid panels, mint-blue canopy, tiny solid yellow and white markings. "
    "No gradients, no shading, no glossy highlight, no texture, no blur, no 3D, no perspective, no "
    "shadow, no pixel art, no text, no border. Isolated and centered on a plain pure white background."
)


def solicitar(prompt, referencia=None):
    """Texto para imagem ou edição da referência, devolvendo os bytes PNG."""
    endereco, cabecalhos = nano.acesso()
    partes = []
    if referencia:
        partes.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(referencia).decode()}})
    partes.append({"text": prompt})
    corpo = {
        "contents": [{"role": "user", "parts": partes}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}},
    }
    pedido = urllib.request.Request(
        endereco,
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", **cabecalhos},
    )
    for tentativa in range(6):
        try:
            resposta = json.load(urllib.request.urlopen(pedido, timeout=180))
            break
        except urllib.error.HTTPError as erro:
            if erro.code not in (429, 503) or tentativa == 5:
                raise RuntimeError(f"A API respondeu {erro.code}: {erro.read().decode(errors='replace')[:500]}")
            espera = 20 * (tentativa + 1)
            print(f"Limite da API ({erro.code}); nova tentativa em {espera}s", flush=True)
            time.sleep(espera)
    for parte in resposta.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in parte:
            return base64.b64decode(parte["inlineData"]["data"])
    motivo = resposta.get("candidates", [{}])[0].get("finishReason", "?")
    raise RuntimeError(f"A API não devolveu imagem ({motivo})")


def guardar(nome, dados):
    original = ga.ORIGINAIS / f"{nome}.png"
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(dados)
    print(f"  original {original.name}", flush=True)


def dobrar_cauda(imagem):
    """Dobra só o comprimento da cauda, mantendo a frente intacta."""
    caixa = imagem.getchannel("A").getbbox()
    imagem = imagem.crop(caixa)
    largura, altura = imagem.size
    alphas = []
    for y in range(altura):
        faixa = imagem.getchannel("A").crop((0, y, largura, y + 1)).getbbox()
        alphas.append(faixa[2] - faixa[0] if faixa else 0)
    largura_max = max(alphas)
    corte = None
    for y in range(int(altura * 0.38), int(altura * 0.82)):
        if alphas[y] < largura_max * 0.4 and all(alphas[min(altura - 1, y + i)] < largura_max * 0.52 for i in range(12)):
            corte = y
            break
    if corte is None:
        raise RuntimeError("Não encontrei o início da cauda do helicóptero")
    frente = imagem.crop((0, 0, largura, corte))
    cauda = imagem.crop((0, corte, largura, altura)).resize(
        (largura, (altura - corte) * 2), Image.Resampling.LANCZOS
    )
    resultado = Image.new("RGBA", (largura, corte + cauda.height))
    resultado.alpha_composite(frente, (0, 0))
    resultado.alpha_composite(cauda, (0, corte))
    print(f"  cauda: {altura - corte}px -> {cauda.height}px (frente preservada)", flush=True)
    return resultado


def processar(nome, dobrar_tambem=False):
    with Image.open(ga.ORIGINAIS / f"{nome}.png") as imagem:
        pronta = ga.tirar_fundo_branco(imagem)
    if dobrar_tambem and nome.startswith("helicoptero"):
        pronta = dobrar_cauda(pronta)
    ga.salvar(pronta, nome, (360, 360) if nome.startswith("helicoptero") else (240, 240))
    print(f"  site {nome}.webp", flush=True)


def corrigir_cauda(helicoptero):
    return solicitar(
        "Edit this exact red top-down helicopter sprite. Keep the nose, cockpit, main body, stub wings, "
        "front shape, front size in pixels, colors, outline, orientation and central rotor hub exactly "
        "unchanged. Measure the current rear tail assembly, starting where it leaves the main body and "
        "ending at the outermost edge of the tail rotor. Make that rear tail assembly EXACTLY TWICE its "
        "current length. Extend only backwards; do not shrink or redraw the front body. Increase the tail "
        "fin and tail rotor proportionally so they remain substantial and readable. Keep only the central "
        "main-rotor hub and NO main blades. Return one complete centered sprite with the whole long tail "
        "visible. " + ESTILO,
        helicoptero,
    )


def ajustar_cauda():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("Alongando a cauda do helicóptero...", flush=True)
    with Image.open(ga.ORIGINAIS / "helicoptero-aereo.png") as imagem:
        helicoptero = corrigir_cauda((ga.ORIGINAIS / "helicoptero-aereo.png").read_bytes())
    guardar("helicoptero-aereo", helicoptero)

    print("Atualizando o helicóptero destruído com a cauda nova...", flush=True)
    destruido = solicitar(
        "Edit this exact helicopter sprite into its destroyed version. Preserve the same long tail boom, "
        "tail fin, tail rotor, main body, central rotor hub, overall silhouette, size and thick black "
        "outline. Keep NO main blades. Change only the paint to dark burnt red and add a few simple jagged "
        "black holes, with a slight bend near the tail tip. No smoke, no fire, no different aircraft."
        + ESTILO,
        helicoptero,
    )
    guardar("helicoptero-destroco", destruido)
    processar("helicoptero-aereo", dobrar_tambem=True)
    processar("helicoptero-destroco", dobrar_tambem=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("Gerando helicóptero novo sem pás fixas...", flush=True)
    helicoptero = solicitar(
        "Single compact red enemy gunship helicopter sprite, photographed exactly vertically from above. "
        "Nose points straight up. Short rounded armored body, small stub wings, mint-blue cockpit, short "
        "tail with a tiny tail rotor. IMPORTANT: absolutely NO main rotor blades and no blurred rotor "
        "disc; only one small plain circular rotor hub in the middle of the roof. " + ESTILO
    )
    guardar("helicoptero-aereo", helicoptero)

    print("Removendo qualquer pá fixa restante do helicóptero...", flush=True)
    helicoptero = solicitar(
        "Edit this exact red top-down helicopter game sprite. Keep its body, cockpit, stub wings, tail, "
        "colors, outline and orientation completely unchanged. Remove every long straight main-rotor "
        "blade and every rotor-disc trace. Leave ONLY one small circular dark rotor hub on the center of "
        "the roof. Do not redraw the helicopter. " + ESTILO,
        helicoptero,
    )
    guardar("helicoptero-aereo", helicoptero)
    helicoptero = corrigir_cauda(helicoptero)
    guardar("helicoptero-aereo", helicoptero)

    print("Gerando avião novo...", flush=True)
    aviao = solicitar(
        "Single compact red enemy fighter jet sprite, photographed exactly vertically from above. Nose "
        "points straight up. One wide simple delta wing silhouette, short twin tail, small mint-blue "
        "canopy, two plain dark circular exhaust nozzles at the rear, tiny solid yellow and white missile "
        "tips. No exhaust flame and no motion trail. " + ESTILO
    )
    guardar("aviao-aereo", aviao)

    print("Criando helicóptero destruído a partir da mesma silhueta...", flush=True)
    helicoptero_destruido = solicitar(
        "Edit this exact helicopter sprite into its destroyed version. Preserve the same overall "
        "silhouette, size, top-down orientation, rotor hub, short tail and thick black outline. Keep only "
        "the central circular rotor hub and NO main blades. Change the red paint to dark burnt red, add a "
        "few simple jagged black holes and slightly bend the tail. No smoke, no fire, do not create a "
        "different aircraft. " + ESTILO,
        helicoptero,
    )
    guardar("helicoptero-destroco", helicoptero_destruido)

    print("Criando avião destruído a partir da mesma silhueta...", flush=True)
    aviao_destruido = solicitar(
        "Edit this exact fighter jet sprite into its destroyed version. Preserve its recognizable "
        "silhouette, wing sweep, twin tail, canopy position, twin exhaust nozzles, size, top-down "
        "orientation and thick black outline. Keep at least 85% of the same outline. Change the red paint "
        "to dark burnt red, open a few simple jagged black holes and shorten only the left wing tip. No "
        "smoke, no fire, no exhaust flame, do not create a different aircraft. " + ESTILO,
        aviao,
    )
    guardar("aviao-destroco", aviao_destruido)

    print("Preparando imagens transparentes para o site...", flush=True)
    for nome in ("helicoptero-aereo", "helicoptero-destroco", "aviao-aereo", "aviao-destroco"):
        processar(nome)


if __name__ == "__main__":
    if "--cauda" in sys.argv:
        ajustar_cauda()
    elif "--reprocessar-cauda" in sys.argv:
        processar("helicoptero-aereo", dobrar_tambem=True)
        processar("helicoptero-destroco", dobrar_tambem=True)
    else:
        main()
