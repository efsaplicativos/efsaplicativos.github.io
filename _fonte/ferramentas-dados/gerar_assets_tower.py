"""Prepara os sprites top-down e gera apenas o cenário ausente com o Nano Banana.

Uso na raiz do repositório, com GEMINI_API_KEY no ambiente:
    python _fonte/ferramentas-dados/gerar_assets_tower.py
    python _fonte/ferramentas-dados/gerar_assets_tower.py --sprites
    python _fonte/ferramentas-dados/gerar_assets_tower.py --cenario

Os pacotes originais não são alterados. As imagens finais ficam em
assets/jogos/tower-defense/web; os originais gerados ficam fora do git.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import imagens_paginas as nano

RAIZ = Path(__file__).resolve().parents[2]
PACOTES = RAIZ / "assets/jogos/tower-defense"
SAIDA = PACOTES / "web"
ORIGINAIS = RAIZ / "_fonte/ferramentas-dados/imagens-originais/tower-defense"
TANQUES = PACOTES / "TopDown-TanksArtillery"

ESTILO_REGIAO = (
    " Chunky polished casual cartoon strategy game style, simplified rounded shapes, clean dark olive "
    "outlines where appropriate, soft flat colors, readable at small sizes. Strictly no pixel art, no "
    "pixelation, no realistic photography, no perspective, no side view, no text, no watermark."
)
ESTILO_AEREO = (
    " Flat 2D cartoon vector sticker in exactly the same visual language as chunky top-down military "
    "tank game sprites: one thick uniform near-black outline around the complete silhouette, large "
    "simple flat armor shapes, only two solid red tones (bright red and darker red for separate panels), "
    "a few rectangular panel lines, tiny solid yellow and white markings, simple mint-blue canopy with "
    "one white highlight line. No gradients, no soft shading, no glossy highlights, no ambient "
    "occlusion, no texture, no blur, no 3D rendering, no perspective, no cast shadow, no motion lines, "
    "no pixel art, no realistic details, no watermark, no text. Iconic silhouette readable at 60 pixels."
)

PROMPTS = {
    "terreno": (
        "Create an original hand-painted illustration of an empty meadow surface for a casual strategy "
        "game. The camera is exactly vertically above the grass at 90 degrees. Fill the whole square "
        "with soft olive-green grass and very subtle painted tonal variations. Uniform diffuse lighting, "
        "low contrast, no recognizable objects, no road, no building, no shadows, no perspective, no "
        "text, no logo, no border. Design the edges to continue naturally when the texture is repeated."
    ),
    "quartel": (
        "Single compact military command bunker game sprite, viewed exactly vertically from directly "
        "overhead at 90 degrees, top-down orthographic, friendly olive green armored roof, small sandbag "
        "details around two sides and a subtle orange command insignia with no letters, chunky polished "
        "casual strategy game style matching top-down tank sprites. Entire building centered and fully "
        "visible, isolated on a perfectly plain pure white background, no ground, no cast shadow, no "
        "perspective, no side view, no text, no watermark, no border."
    ),
    "arvore": (
        "Single leafy military-green tree game sprite, viewed exactly vertically from directly overhead "
        "at 90 degrees, top-down orthographic, round irregular canopy with layered green leaves and a "
        "tiny trunk visible in the center, chunky polished casual strategy game style. Entire canopy "
        "centered and fully visible, isolated on a perfectly plain pure white background, no ground, no "
        "cast shadow, no perspective, no side view, no text, no watermark, no border."
    ),
    "terreno-deserto": (
        "Original seamless game texture of a quiet desert surface viewed exactly vertically from above, "
        "warm muted golden sand with subtle hand-painted dunes and tiny tonal variations, uniform diffuse "
        "lighting, low contrast, no objects, no road, no buildings, no shadows. Edges continue naturally "
        "when repeated." + ESTILO_REGIAO
    ),
    "decoracao-deserto": (
        "Single small round cactus game sprite viewed exactly vertically from directly overhead at 90 "
        "degrees, three rounded green cactus pads arranged around the center, tiny warm orange flower in "
        "the middle, fully visible and isolated on a pure white background, no ground and no cast shadow."
        + ESTILO_REGIAO
    ),
    "terreno-neve": (
        "Original seamless game texture of undisturbed snow viewed exactly vertically from above, soft "
        "pale blue-white surface with subtle hand-painted icy tonal variations, uniform diffuse lighting, "
        "low contrast, no objects, no footprints, no road, no buildings, no shadows. Edges continue "
        "naturally when repeated." + ESTILO_REGIAO
    ),
    "decoracao-neve": (
        "Single snow-covered pine tree game sprite viewed exactly vertically from directly overhead at 90 "
        "degrees, layered rounded star-shaped deep green branches dusted with white snow and a tiny trunk "
        "at the center, fully visible and isolated on a pure white background, no ground and no cast shadow."
        + ESTILO_REGIAO
    ),
    "terreno-vulcao": (
        "Original seamless game texture of dark volcanic basalt viewed exactly vertically from above, "
        "charcoal and muted dark brown rock with subtle hand-painted cracks and very restrained warm "
        "orange accents, low contrast, no lava rivers, no objects, no road, no buildings, no shadows. "
        "Edges continue naturally when repeated." + ESTILO_REGIAO
    ),
    "decoracao-vulcao": (
        "Single rounded volcanic rock cluster game sprite viewed exactly vertically from directly overhead "
        "at 90 degrees, chunky dark gray basalt with one small muted orange glowing crack, fully visible "
        "and isolated on a pure white background, no ground, no lava pool and no cast shadow."
        + ESTILO_REGIAO
    ),
    "helicoptero-aereo": (
        "Single compact red enemy gunship helicopter game sprite viewed exactly vertically from directly "
        "overhead at 90 degrees, nose pointing straight up, short rounded rectangular armored fuselage, two "
        "tiny stub wings, small mint-blue cockpit window, very short tail boom with a tiny dark tail rotor, "
        "and ONLY one large plain circular main-rotor hub in the center, absolutely no main rotor blades. "
        "Fully visible, centered and isolated on a perfectly plain pure white background, no ground."
        + ESTILO_AEREO
    ),
    "helicoptero-destroco": (
        "Destroyed version of the same compact red gunship helicopter viewed exactly vertically from directly "
        "overhead at 90 degrees, nose pointing up, dark burnt-red rectangular fuselage, a few simple jagged "
        "black holes, bent short tail boom, only the plain circular main-rotor hub and no long blades, no "
        "smoke, no fire, fully visible and centered on a perfectly plain pure white background, no ground."
        + ESTILO_AEREO
    ),
    "aviao-aereo": (
        "Single compact red enemy fighter jet game sprite viewed exactly vertically from directly overhead at "
        "90 degrees, nose pointing straight up, one wide simple delta wing silhouette, short twin tail, "
        "small mint-blue canopy, two plain dark circular exhaust nozzles at the rear, tiny solid yellow and "
        "white missile tips. Fully visible, centered and isolated on a perfectly plain pure white background, "
        "no ground, no exhaust flame, no motion trail."
        + ESTILO_AEREO
    ),
    "aviao-destroco": (
        "Destroyed version of the same compact red fighter jet viewed exactly vertically from directly "
        "overhead at 90 degrees, nose pointing up, dark burnt-red body, a few simple jagged black holes, the "
        "left wing shortened and broken, damaged twin tail, two plain dark exhaust nozzles, no smoke, no "
        "fire, no motion trail, fully visible and centered on a perfectly plain pure white background."
        + ESTILO_AEREO
    ),
}

# Conjuntos conferidos na folha 28---25-Top-down---tanks-artillery.png:
# base normal/destruída, torre normal/destruída, pontos de giro e lagartas esquerda/direita.
SPRITES = {
    "canhao": (66, 67, 68, 69, (0.50, 0.72), (0.50, 0.72), 70, 71),
    "metralhadora": (86, 87, 88, 89, (0.50, 0.73), (0.50, 0.73), 96, 97),
    "artilharia": (27, 28, 29, 30, (0.50, 0.73), (0.50, 0.65), 32, 32),
    "leve": (2, 3, 1, 4, (0.50, 0.673), (0.50, 0.59), 7, 8),
    "rapido": (54, 55, 56, 57, (0.50, 0.82), (0.50, 0.67), 58, 59),
    "pesado": (112, 113, 114, 115, (0.50, 0.73), (0.50, 0.72), 116, 117),
    "boss": (98, 99, 100, 101, (0.50, 0.74), (0.50, 0.72), 102, 103),
}
INIMIGOS = {"leve", "rapido", "pesado", "boss"}
QUADROS_LAGARTA = 8
# Espessura acumulada: 15% do ajuste anterior + 10% solicitado agora.
ESPESSURA_LAGARTA_INIMIGO = 1.15 * 1.10
RECOLHIMENTO_LAGARTA_INIMIGO = 0.16


def arquivo_tanque(numero):
    encontrados = list(TANQUES.rglob(f"*-{numero:02d}.png"))
    if len(encontrados) != 1:
        raise RuntimeError(f"Sprite {numero}: esperava um arquivo, encontrei {len(encontrados)}")
    return encontrados[0]


def recortar(imagem):
    imagem = imagem.convert("RGBA")
    return imagem.crop(imagem.getchannel("A").getbbox() or (0, 0, *imagem.size))


def salvar(imagem, nome, tamanho=None):
    if tamanho:
        imagem.thumbnail(tamanho, Image.Resampling.LANCZOS)
    imagem.save(SAIDA / f"{nome}.webp", "WEBP", quality=90, method=6)


def normalizar_torre(imagem, giro):
    """Centraliza o eixo para a torreta girar sem deslocar sua base."""
    lado = int(max(imagem.width, imagem.height) * 1.8)
    normalizada = Image.new("RGBA", (lado, lado))
    px = int(giro[0] * imagem.width)
    py = int(giro[1] * imagem.height)
    normalizada.alpha_composite(imagem, (lado // 2 - px, lado // 2 - py))
    return normalizada


def montar_lagartas(base, esquerda, direita, espessura=1.0, recolhimento=0.0):
    """Monta as lagartas atrás da base; espessura altera só a largura de cada esteira."""
    altura = base.height
    esquerda = esquerda.resize((round(esquerda.width * altura / esquerda.height * espessura), altura), Image.Resampling.LANCZOS)
    direita = direita.resize((round(direita.width * altura / direita.height * espessura), altura), Image.Resampling.LANCZOS)
    largura = base.width + max(esquerda.width, direita.width)
    aproximar = round(max(esquerda.width, direita.width) * recolhimento)
    quadro = Image.new("RGBA", (largura * QUADROS_LAGARTA, altura))
    mascara_e = esquerda.getchannel("A")
    mascara_d = direita.getchannel("A")
    periodo = altura / 8
    for indice in range(QUADROS_LAGARTA):
        deslocamento = round(periodo * indice)
        # O desenho rola, mas a silhueta e o contorno exterior permanecem fixos.
        mov_e = ImageChops.offset(esquerda, 0, deslocamento)
        mov_d = ImageChops.offset(direita, 0, deslocamento)
        mov_e.putalpha(mascara_e)
        mov_d.putalpha(mascara_d)
        x = indice * largura
        quadro.alpha_composite(mov_e, (x + aproximar, 0))
        quadro.alpha_composite(mov_d, (x + largura - direita.width - aproximar, 0))
    estatica = quadro.crop((0, 0, largura, altura))
    return estatica, quadro


def preparar_sprites():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for nome, dados in SPRITES.items():
        base, destruida, torre, torre_destruida, giro, giro_destruido, esteira_e, esteira_d = dados
        with Image.open(arquivo_tanque(base)) as original:
            base_img = recortar(original)
        salvar(base_img, f"{nome}-base", (220, 220))
        with Image.open(arquivo_tanque(destruida)) as original:
            base_destruida = recortar(original)
        salvar(base_destruida, f"{nome}-base-destruida", (220, 220))

        with Image.open(arquivo_tanque(esteira_e)) as original:
            lagarta_e = recortar(original)
        with Image.open(arquivo_tanque(esteira_d)) as original:
            lagarta_d = recortar(original)
        estatica, animada = montar_lagartas(
            base_img, lagarta_e, lagarta_d,
            espessura=ESPESSURA_LAGARTA_INIMIGO if nome in INIMIGOS else 1.0,
            recolhimento=RECOLHIMENTO_LAGARTA_INIMIGO if nome in INIMIGOS else 0.0,
        )
        salvar(estatica, f"{nome}-lagartas", (440, 440))
        if nome in INIMIGOS:
            animada.save(SAIDA / f"{nome}-lagartas-animadas.webp", "WEBP", quality=88, method=6)

        with Image.open(arquivo_tanque(torre)) as original:
            normalizada = normalizar_torre(recortar(original), giro)
        salvar(normalizada, f"{nome}-torre", (360, 360))
        with Image.open(arquivo_tanque(torre_destruida)) as original:
            quebrada = normalizar_torre(recortar(original), giro_destruido)
        salvar(quebrada, f"{nome}-torre-destruida", (360, 360))

        if nome in ("canhao", "metralhadora", "artilharia"):
            icone = Image.new("RGBA", (192, 192))
            trilhos = estatica.copy()
            trilhos.thumbnail((126, 108), Image.Resampling.LANCZOS)
            icone.alpha_composite(trilhos, ((192 - trilhos.width) // 2, (192 - trilhos.height) // 2 + 12))
            corpo = base_img.copy()
            corpo.thumbnail((108, 108), Image.Resampling.LANCZOS)
            icone.alpha_composite(corpo, ((192 - corpo.width) // 2, (192 - corpo.height) // 2 + 12))
            cano = normalizada.copy()
            cano.thumbnail((176, 176), Image.Resampling.LANCZOS)
            icone.alpha_composite(cano, ((192 - cano.width) // 2, (192 - cano.height) // 2))
            salvar(icone, f"icone-{nome}")
    print(f"Sprites, destroços e lagartas animadas preparados em {SAIDA}")


def tirar_fundo_branco(imagem):
    """Remove só o branco ligado às bordas, preservando detalhes claros dentro do desenho."""
    rgb = imagem.convert("RGB")
    magenta = (255, 0, 255)
    largura, altura = rgb.size
    for canto in ((0, 0), (largura - 1, 0), (0, altura - 1), (largura - 1, altura - 1)):
        if rgb.getpixel(canto) != magenta:
            ImageDraw.floodfill(rgb, canto, magenta, thresh=48)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(Image.new("L", rgba.size, 255))
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            if r > 245 and g < 12 and b > 245:
                pixels[x, y] = (r, g, b, 0)
    alpha = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(0.55))
    rgba.putalpha(alpha)
    return rgba.crop(alpha.getbbox() or (0, 0, *rgba.size))


def gerar_cenario():
    nano.ESTILO = ""
    endereco, cabecalhos = nano.acesso()
    SAIDA.mkdir(parents=True, exist_ok=True)
    for nome, prompt in PROMPTS.items():
        original = ORIGINAIS / f"{nome}.png"
        if not original.exists():
            nano.IMAGENS[nome] = prompt
            print(f"Gerando {nome} com Nano Banana...", flush=True)
            dados = nano.gerar(nome, endereco, cabecalhos)
            if not dados:
                raise RuntimeError(f"A API não devolveu a imagem {nome}")
            original.parent.mkdir(parents=True, exist_ok=True)
            original.write_bytes(dados)
        with Image.open(original) as imagem:
            if nome.startswith("terreno"):
                pronta = imagem.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
                pronta.save(SAIDA / f"{nome}.webp", "WEBP", quality=84, method=6)
            else:
                pronta = tirar_fundo_branco(imagem)
                salvar(pronta, nome, (320, 320) if nome == "quartel" else (240, 240))
        print(f"  {SAIDA / (nome + '.webp')}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--cenario" not in sys.argv:
        preparar_sprites()
    if "--sprites" not in sys.argv:
        gerar_cenario()


if __name__ == "__main__":
    main()
