"""Gera com o Nano Banana (Gemini 2.5 Flash Image) a imagem de cada ferramenta de matemática.

Uso, na raiz do repositório, com o login do gcloud (Vertex AI no projeto VERTEX_PROJETO, padrão
efsaplicativos) ou com a chave da API do Gemini (https://aistudio.google.com/apikey) na variável
GEMINI_API_KEY, sem gravar a chave em arquivo nenhum:

    python _fonte/ferramentas-dados/imagens_ferramentas.py            # só as que ainda não existem
    python _fonte/ferramentas-dados/imagens_ferramentas.py geometria  # refaz uma
    python _fonte/ferramentas-dados/imagens_ferramentas.py --reduzir  # só refaz as versões do site

A imagem original (1024 px) fica em _fonte/ferramentas-dados/imagens-originais/ (fora do git) e a
versão do site, 192×192 em WebP e com o desenho enquadrado, em images/ferramentas/<slug>.webp.
Precisa do Pillow (pip install pillow).
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
ORIGINAIS = RAIZ / "_fonte/ferramentas-dados/imagens-originais"
SITE = RAIZ / "images/ferramentas"
MODELO = "gemini-2.5-flash-image"
PROJETO_VERTEX = os.environ.get("VERTEX_PROJETO", "efsaplicativos")

# Mesmo estilo em todas, para as imagens parecerem da mesma família
ESTILO = (
    "Square app icon illustration, soft glossy 3D style with rounded shapes and gentle shadows, "
    "a single clear subject centered and filling about 80% of the frame, on a plain pure white "
    "background. Color palette: royal blue (#2563eb), violet (#7c3aed) and warm orange (#f59e0b) "
    "accents with white and light gray. Clean, friendly and modern, readable at small sizes. "
    "The background is pure white all the way to the edges and corners. "
    "No words, no letters, no watermark, no border, no frame, no rounded tile behind the subject."
)

IMAGENS = {
    "calculadora": "A modern handheld basic calculator with a display and large rounded keys, "
    "the equals key highlighted in orange.",
    "calculadora-cientifica": "A scientific calculator with many small function keys, with a "
    "floating sine wave curve and a pi symbol beside it.",
    "equacoes": "A coordinate graph card with one smooth U-shaped parabola that crosses the "
    "horizontal axis at two points marked with orange dots, with an equals sign and a square root "
    "symbol floating close to the card.",
    "estatistica": "A bar chart with five rising bars and a smooth bell curve drawn over them, "
    "with a small magnifying glass.",
    "geometria": "A group of geometric solids, a cube, a cylinder, a cone and a sphere, with a "
    "ruler and a protractor leaning against them.",
    "matrizes": "A three by three grid of square tiles with simple dots on them, enclosed by two "
    "tall straight square brackets on the left and right, like a matrix in mathematics "
    "(square brackets, not curly braces).",
    "conversor-de-bases": "A compact square composition: on top a row of four blue tiles with the "
    "binary digits 1 0 1 1, below it one large orange tile with the hexadecimal letter B, and a "
    "curved violet arrow going from the top row to the orange tile.",
}


def acesso() -> tuple[str, dict]:
    """Endereço e cabeçalhos: API do Gemini com GEMINI_API_KEY ou, sem ela, Vertex AI com o gcloud."""
    chave = os.environ.get("GEMINI_API_KEY", "").strip()
    if chave:
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent",
            {"x-goog-api-key": chave},
        )
    token = subprocess.run(
        ["gcloud.cmd" if os.name == "nt" else "gcloud", "auth", "print-access-token"],
        capture_output=True, text=True,
    ).stdout.strip()
    if not token:
        sys.exit("Defina GEMINI_API_KEY ou entre no gcloud (gcloud auth login) antes de rodar.")
    return (
        f"https://aiplatform.googleapis.com/v1/projects/{PROJETO_VERTEX}/locations/global"
        f"/publishers/google/models/{MODELO}:generateContent",
        {"Authorization": f"Bearer {token}"},
    )


def gerar(slug: str, endereco: str, cabecalhos: dict) -> bytes:
    corpo = {
        "contents": [{"role": "user", "parts": [{"text": f"{IMAGENS[slug]} {ESTILO}"}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}},
    }
    pedido = urllib.request.Request(
        endereco,
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", **cabecalhos},
    )
    # 429 (limite por minuto) e 503 passam sozinhos: espera e tenta de novo
    for tentativa in range(6):
        try:
            resposta = json.load(urllib.request.urlopen(pedido, timeout=180))
            break
        except urllib.error.HTTPError as erro:
            if erro.code not in (429, 503) or tentativa == 5:
                sys.exit(f"{slug}: a API respondeu {erro.code}: {erro.read().decode(errors='replace')[:500]}")
            espera = 30 * (tentativa + 1)
            print(f"  limite da API ({erro.code}), tentando de novo em {espera} s", flush=True)
            time.sleep(espera)
    for parte in resposta.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in parte:
            return base64.b64decode(parte["inlineData"]["data"])
    sys.exit(f"{slug}: a resposta não trouxe imagem: {json.dumps(resposta)[:500]}")


def reduzir(slug: str) -> None:
    """Recorta o branco em volta do desenho, deixa uma margem igual e salva a versão do site."""
    with Image.open(ORIGINAIS / f"{slug}.png") as imagem:
        imagem = imagem.convert("RGB")
    # Às vezes o modelo desenha o fundo branco como um cartão arredondado sobre preto: os cantos
    # escuros viram branco
    largura, altura = imagem.size
    for canto in ((0, 0), (largura - 1, 0), (0, altura - 1), (largura - 1, altura - 1)):
        if sum(imagem.getpixel(canto)) < 180:
            ImageDraw.floodfill(imagem, canto, (255, 255, 255), thresh=60)
    # Pixels que não são quase brancos, sem contar a sombra clara embaixo do desenho; o MinFilter
    # ignora linhas finas, como a borda que sobra desses cantos
    mascara = imagem.convert("L").point(lambda v: 255 if v < 236 else 0).filter(ImageFilter.MinFilter(9))
    caixa = mascara.getbbox() or (0, 0, *imagem.size)
    caixa = (caixa[0] - 4, caixa[1] - 4, caixa[2] + 4, caixa[3] + 4)
    lado = int(max(caixa[2] - caixa[0], caixa[3] - caixa[1]) * 1.14)
    centro_x, centro_y = (caixa[0] + caixa[2]) // 2, (caixa[1] + caixa[3]) // 2
    quadro = Image.new("RGB", (lado, lado), "white")
    quadro.paste(imagem, (lado // 2 - centro_x, lado // 2 - centro_y))
    quadro.resize((192, 192), Image.LANCZOS).save(SITE / f"{slug}.webp", "WEBP", quality=88, method=6)


def main() -> None:
    if sys.argv[1:2] == ["--reduzir"]:
        # Só refaz as versões do site a partir das originais já geradas
        SITE.mkdir(parents=True, exist_ok=True)
        for slug in sys.argv[2:] or [s for s in IMAGENS if (ORIGINAIS / f"{s}.png").exists()]:
            reduzir(slug)
            print(f"  {SITE / f'{slug}.webp'}")
        return
    endereco, cabecalhos = acesso()
    pedidos = sys.argv[1:] or [s for s in IMAGENS if not (SITE / f"{s}.webp").exists()]
    desconhecidos = [s for s in pedidos if s not in IMAGENS]
    if desconhecidos:
        sys.exit(f"Sem descrição para: {', '.join(desconhecidos)}. Opções: {', '.join(IMAGENS)}")
    ORIGINAIS.mkdir(parents=True, exist_ok=True)
    SITE.mkdir(parents=True, exist_ok=True)
    for slug in pedidos:
        print(f"gerando {slug}...", flush=True)
        original = ORIGINAIS / f"{slug}.png"
        original.write_bytes(gerar(slug, endereco, cabecalhos))
        reduzir(slug)
        print(f"  {SITE / f'{slug}.webp'}")
    print("pronto" if pedidos else "todas as imagens já existem; passe o nome de uma para refazer")


if __name__ == "__main__":
    main()
