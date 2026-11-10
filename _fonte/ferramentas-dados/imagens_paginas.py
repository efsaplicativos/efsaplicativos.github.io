"""Gera com o Nano Banana (Gemini 2.5 Flash Image) a imagem de cada ferramenta e de cada jogo do site.

Uso, na raiz do repositório, com o login do gcloud (Vertex AI no projeto VERTEX_PROJETO, padrão
efsaplicativos) ou com a chave da API do Gemini (https://aistudio.google.com/apikey) na variável
GEMINI_API_KEY, sem gravar a chave em arquivo nenhum:

    python _fonte/ferramentas-dados/imagens_paginas.py            # só as que ainda não existem
    python _fonte/ferramentas-dados/imagens_paginas.py geometria  # refaz uma (ou jogos/sudoku)
    python _fonte/ferramentas-dados/imagens_paginas.py --reduzir  # só refaz as versões do site

A imagem original (1024 px) fica em _fonte/ferramentas-dados/imagens-originais/<seção>/ (fora do
git) e a versão do site, 192×192 em WebP e com o desenho enquadrado, em images/<seção>/<página>.webp.
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
SITE = RAIZ / "images"
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

# Chave: <seção>/<página>, igual ao endereço da página no site
IMAGENS = {
    # Finanças
    "ferramentas/salario-liquido": "A neat white pay slip document with a few horizontal lines and "
    "a big blue arrow pointing down to a small shiny pile of gold coins and one banknote.",
    "ferramentas/rescisao-trabalhista": "A closed brown cardboard box with a white document and a "
    "blue pen resting on top of it, with a violet arrow pointing up beside the box.",
    "ferramentas/ferias-e-decimo-terceiro": "A bright beach scene with a straw sun hat, a pair of "
    "sunglasses and a small blue calendar page showing the number thirteen, all on a warm sand tone.",
    "ferramentas/regra-de-tres": "A white sheet of paper with a simple drawn fraction made of two "
    "blue rectangles and an equals sign followed by a violet question mark, with an orange pencil "
    "resting diagonally across the corner.",
    "ferramentas/porcentagem": "Two big rounded percentage symbols made of violet and orange circles "
    "with small squares between them, floating above a small white price tag with a blue string.",
    "ferramentas/preco-por-quilo": "A small silver scale with a paper coffee bag and a paper rice "
    "bag on its plate, with a blue and orange price tag hanging beside it.",
    "jogos/soletra": "Seven round letter tiles arranged in a hexagon around one larger warm orange "
    "tile in the center, like a spelling game board.",
    "jogos/forca": "A simple wooden gallows with a rope and a blue stick figure drawn on it, with "
    "four white letter tiles below spelling a blank space, A, E and S.",
    "ferramentas/energia-eletrica": "A white wall power outlet with a blue plug connected and a warm "
    "orange lightning bolt floating above it, with a small violet energy meter beside.",
    "ferramentas/churrasco": "A small round charcoal grill with glowing orange coals, three skewers "
    "of meat and a pair of blue tongs resting beside it.",
    "ferramentas/juros-compostos": "Stacks of gold coins growing taller from left to right, each "
    "stack much taller than the last, with a smooth upward curved arrow sweeping over them.",
    "ferramentas/juros-simples": "Four stacks of gold coins in a row, each one exactly one coin "
    "taller than the previous, with a perfectly straight diagonal arrow rising above them.",
    "ferramentas/investimento-com-aportes": "A clear glass jar half full of gold coins with one more "
    "coin falling into it from above, and a small green seedling with two leaves growing out of "
    "the coins.",
    "ferramentas/financiamento": "A small cozy house with a blue roof standing on a paper document "
    "with a table of rows like a payment schedule, with a few gold coins beside it.",
    "ferramentas/aposentadoria": "A comfortable rocking chair beside a big piggy bank and a small "
    "hourglass, a calm and relaxed scene.",
    "ferramentas/correcao-ipca": "A shopping basket with groceries and a price tag on a string, with "
    "a bold orange upward arrow and a percent sign floating beside it.",
    "ferramentas/conversor-de-moedas": "Two large coins, one marked with a dollar sign and one marked "
    "with a euro sign, with two curved arrows circling between them to show an exchange.",
    "ferramentas/calculadora-financeira-rpn": "A large wide landscape-oriented financial calculator "
    "filling the frame, seen slightly from above, with a long display along the top and four rows "
    "of keys, one wide key highlighted in orange, and a small stack of gold coins at its side.",
    # Matemática
    "ferramentas/calculadora": "A modern handheld basic calculator with a display and large rounded "
    "keys, the equals key highlighted in orange.",
    "ferramentas/calculadora-cientifica": "A scientific calculator with many small function keys, "
    "with a floating sine wave curve and a pi symbol beside it.",
    "ferramentas/equacoes": "A coordinate graph card with one smooth U-shaped parabola that crosses "
    "the horizontal axis at two points marked with orange dots, with an equals sign and a square "
    "root symbol floating close to the card.",
    "ferramentas/estatistica": "A bar chart with five rising bars and a smooth bell curve drawn over "
    "them, with a small magnifying glass.",
    "ferramentas/geometria": "A group of geometric solids, a cube, a cylinder, a cone and a sphere, "
    "with a ruler and a protractor leaning against them.",
    "ferramentas/matrizes": "A three by three grid of square tiles with simple dots on them, enclosed "
    "by two tall straight square brackets on the left and right, like a matrix in mathematics "
    "(square brackets, not curly braces).",
    "ferramentas/conversor-de-bases": "A compact square composition: on top a row of four blue tiles "
    "with the binary digits 1 0 1 1, below it one large orange tile with the hexadecimal letter B, "
    "and a curved violet arrow going from the top row to the orange tile.",
    # Conversores e dia a dia
    "ferramentas/conversor-de-medidas": "A yellow retractable tape measure partly pulled out, a "
    "measuring cup and a small metal weight grouped together.",
    "ferramentas/conversor-de-temperatura": "A large thermometer with an orange liquid column, a "
    "snowflake floating on its left and a small smiling sun on its right.",
    "ferramentas/calculadora-de-combustivel": "A fuel pump nozzle with its hose, between two big "
    "liquid drops, one green drop on the left and one orange drop on the right.",
    "ferramentas/calculadora-de-datas": "A desk calendar page with a grid of day squares, two of the "
    "days circled in orange and joined by a curved violet arrow.",
    "ferramentas/calculadora-de-idade": "A small birthday cake with lit candles and a sprinkle of "
    "confetti, next to a small hourglass.",
    "ferramentas/fuso-horario": "A blue globe with meridian lines and a round analog wall clock in "
    "front of it, slightly overlapping the globe.",
    "ferramentas/cronometro-e-timer": "A shiny classic stopwatch with a button on top, a clean white "
    "dial with tick marks and one orange hand.",
    "ferramentas/lei-de-ohm": "An electronic resistor with colored bands connected by wires to a "
    "glowing light bulb, with a small orange lightning bolt above.",
    # Saúde
    "ferramentas/imc": "A flat bathroom scale with a soft tape measure draped over it and a small red "
    "heart beside it.",
    "ferramentas/consumo-de-agua": "A clear glass of water with ice cubes next to a reusable water "
    "bottle, with one large blue water drop floating above.",
    # Organização e lazer
    "ferramentas/lista-de-compras": "A shopping basket with fresh vegetables, a loaf of bread and a "
    "milk carton, with a small paper list beside it.",
    "ferramentas/lista-de-tarefas": "A clipboard with a checklist of three lines, the first two with "
    "orange check marks in their boxes, and a pencil leaning on it.",
    "ferramentas/consulta-cep": "A big orange location map pin standing on a folded paper street map, "
    "with a small mail envelope beside it.",
    "ferramentas/gerador-de-numeros-loteria": "A transparent spherical lottery drum on a stand with "
    "colorful numbered balls inside, and three balls rolling out in front of it.",
    "ferramentas/marcador-de-truco": "Three playing cards fanned out showing a heart, a spade and a "
    "club symbol, with a few wooden matchsticks lying in front of them to keep score.",
    "ferramentas/relogio-de-xadrez": "A large classic analog chess clock filling the frame, a wooden "
    "box with two round clock faces side by side and two push buttons on top, with a small chess "
    "knight piece standing beside it.",
    "ferramentas/relogio-de-blinds-poker": "Neat stacks of poker chips in blue, violet and orange, "
    "with a small round timer clock behind them.",
    # Jogos: lógica e quebra-cabeças
    "jogos/2048": "A square board with a four by four grid of rounded tiles in blue, violet and "
    "orange shades. Only three tiles have numbers: two tiles with the number 2 and one tile with "
    "the number 4; every other tile is blank. The two tiles with 2 slide together with motion "
    "lines.",
    "jogos/sudoku": "A sudoku puzzle grid of nine by nine cells with thicker lines around the three "
    "by three boxes, slightly tilted, with a pencil lying on it. Some cells hold a single digit "
    "from 1 to 9, only digits, never letters, and most cells are empty.",
    "jogos/campo-minado": "A grid of raised square tiles, some opened and flat, with a round black "
    "spiky mine on one tile and a small red flag on another.",
    "jogos/quebra-cabeca": "A square tray with a three by three grid of sliding tiles and one empty "
    "slot, one tile sliding into the gap with a small arrow, the tiles showing parts of a simple "
    "landscape picture with a hill and a sun.",
    "jogos/color-sort": "Four clear glass test tubes standing in a row, each filled with a stack of "
    "glossy colored balls in blue, violet, orange and green, the colors mixed between the tubes.",
    "jogos/mahjong": "A small stacked pyramid of ivory mahjong tiles, the tiles decorated with simple "
    "colored circle patterns and bamboo stick patterns, no characters.",
    "jogos/desvenda": "A small square board, seen slightly from above, holding a grid of three rows "
    "of five chunky rounded square tiles, all completely blank. Top row: light gray tiles with one "
    "warm orange tile. Middle row: two bright grass green tiles, one orange and two light gray. "
    "Bottom row: all five tiles bright grass green. The green is a true green, not blue. A glowing "
    "yellow light bulb with short light rays floats over the top right corner of the board. "
    "Absolutely no letters, numbers or symbols on any tile.",
    "jogos/caca-palavras": "A square sheet of puzzle paper, seen slightly from above, printed with a "
    "grid of small square cells; every cell holds only one tiny gray dot. Three rounded translucent "
    "highlighter marks cross the grid: an orange one horizontal, a green one vertical and a violet "
    "one diagonal. A small magnifying glass with a blue handle rests on the bottom right corner of "
    "the sheet. Absolutely no letters, numbers or symbols anywhere.",
    # Jogos: memória e reflexo
    "jogos/jogo-da-memoria": "Four memory game cards in a two by two layout: two face down with a "
    "blue patterned back, and two face up showing the same cute cartoon cat face.",
    "jogos/cores-da-memoria": "Four big rounded square buttons in a two by two arrangement, colored "
    "blue, violet, orange and green, with the orange one glowing brightly as if lit up.",
    "jogos/lumibricks": "Colorful glowing falling blocks, each made of four connected squares, "
    "stacking neatly at the bottom with one shiny golden block falling from the top.",
    "jogos/cobrinha": "A cheerful bright green snake made of rounded square segments curving across "
    "a dark green grid board, with a shiny red apple with a small leaf just ahead of its head.",
    # Jogos: estratégia e tabuleiro
    "jogos/puzzles-de-xadrez": "A white chess knight and a black chess king standing on a few squares "
    "of a chessboard, with a glowing light bulb floating above them.",
    "jogos/batalha-naval": "A small gray battleship on stylized blue sea waves, with a round target "
    "crosshair and a white water splash beside it.",
    "jogos/jogo-da-velha": "A tic-tac-toe grid made of four raised orange bars crossing each other, "
    "floating with no base plate, with blue X-shaped pieces and violet O-shaped pieces in some of "
    "the cells.",
    "jogos/lig-4": "A deep blue standing board with a grid of round empty holes seen slightly from "
    "above, with four violet discs lined up horizontally in the bottom row and one warm orange disc "
    "falling into an empty hole from the top.",
    "jogos/damas": "A cream and violet checkered game board seen slightly from above, with one blue "
    "round game piece wearing a small golden crown and one orange round game piece beside it.",
    # Jogos: cartas
    "jogos/paciencia": "A small fan of four playing cards slightly overlapping, each white card "
    "showing one big suit symbol in the middle: a red heart, a black spade, a red diamond and a "
    "black club. Only the suit symbols, no letters and no numbers anywhere on the cards. Behind "
    "the fan, one more card lies face down with an orange patterned back.",
    "jogos/paciencia-spider": "A neat diagonal cascade of five overlapping white playing cards, each "
    "showing only one big black spade symbol in the middle, with no letters and no numbers anywhere "
    "on the cards. Beside the cascade, two cards lie face down with a purple patterned back. A small "
    "friendly cartoon spider hangs from a thin thread above the cards.",
    "jogos/freecell": "A small rounded blue felt mat seen from above. Along its top edge, four empty "
    "card-shaped slots with soft outlines, one of them holding a white playing card with a big red "
    "heart. Below the slots, one straight vertical column of four white playing cards, each card "
    "overlapping the one above it so that only its top part shows, except the last card, fully "
    "visible. Each card has just one suit symbol at the top and none elsewhere: from top to bottom "
    "a black spade, a red diamond, a black club and a red heart. No letters and no numbers anywhere "
    "on the cards.",
    "jogos/paciencia-piramide": "A small pyramid of white playing cards seen from the front on a "
    "rounded burgundy felt mat: one card on top, two cards in the middle row and three cards in the "
    "bottom row, each row slightly overlapping the row above. Every card shows only one big suit "
    "symbol in the middle: the top card a red heart, the middle row two black spades, the bottom row "
    "a red diamond, a black club and a red heart. No letters and no numbers anywhere on the cards. "
    "Beside the pyramid, one card lies face down with a navy blue back and a thin gold border.",
    "jogos/paciencia-golf": "A small rounded deep green felt mat with soft mowing stripes. On it, "
    "a row of three plain white playing cards and, below them, one more white card. Each card shows "
    "exactly one large suit symbol in its center and nothing at all in its corners: from left to "
    "right a black spade, a red heart and a black club, and the lower card a red diamond. In a corner "
    "of the mat, a tiny white golf ball on a wooden tee and a small red flag on a thin pole. No "
    "letters, no numbers and no small symbols anywhere on the cards.",
    "jogos/oito-maluco": "A small rounded orange-brown felt mat. In the middle, a face-down pile "
    "of cards with a navy blue patterned back and, beside it, one face-up plain white card. In front, "
    "a loose fan of three plain white cards. Each face-up card shows exactly one large suit symbol in "
    "its center and nothing at all in its corners: the single card a red heart, the fan a black club, "
    "a red diamond and a black spade. A few small colorful confetti swirls float above the cards. No "
    "letters, no numbers and no small symbols anywhere on the cards.",
    "jogos/copas": "A small rounded plum-purple felt mat. In the middle, four plain white playing "
    "cards meet in a loose cross, one pointing toward each side of the mat as if just played in a "
    "trick. Each card shows exactly one large suit symbol in its center and nothing at all in its "
    "corners: three cards a red heart and the fourth a black spade. Near one edge, a short face-down "
    "fan of three cards with a navy blue back and a thin gold border. No letters, no numbers and no "
    "small symbols anywhere on the cards.",
    "jogos/truco": "A small rounded warm-brown wooden table top. In the middle, a hand of three plain "
    "white playing cards fanned out and, in front of it, one more white card lying flat next to one "
    "card lying face down with a navy blue back and a thin gold border. Each face-up card shows "
    "exactly one large suit symbol in its center and nothing at all in its corners: the fan a black "
    "club, a red heart and a black spade, the flat card a red diamond. Beside the cards, a small heap "
    "of shiny brown beans used to keep score. No letters, no numbers and no small symbols anywhere "
    "on the cards.",
    "jogos/mico": "A small rounded sunny orange felt mat. On it, a small fan of four plain white "
    "playing cards slightly overlapping. Each card shows exactly one large suit symbol in its center "
    "and nothing at all in its corners: a red heart, a black spade, a red diamond and a black club. "
    "A small cute cartoon monkey face with round ears and a friendly smile peeks over the top of the "
    "fan. Beside the fan, one card lies face down with a navy blue back and a thin gold border. No "
    "letters, no numbers and no small symbols anywhere on the cards.",
    "jogos/buraco": "A small rounded indigo felt mat. Across it, a neat straight row of five plain "
    "white playing cards overlapping sideways, all of them hearts: each card is completely blank "
    "except for one large red heart in its center, with nothing in its corners. A tiny gold ribbon "
    "badge rests on the first card of the row. Below the row, two small face-down stacks of cards "
    "with a red-brown patterned back and one more completely blank white card with only one large "
    "black spade in its center. No letters, no numbers and no small symbols anywhere on the cards.",
    # Jogos: conhecimento
    "jogos/qual-e-a-bandeira": "A blue globe with several small colorful flags on poles stuck around "
    "it and a big orange question mark floating beside it.",
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


def gerar(pagina: str, endereco: str, cabecalhos: dict) -> bytes:
    corpo = {
        "contents": [{"role": "user", "parts": [{"text": f"{IMAGENS[pagina]} {ESTILO}"}]}],
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
                sys.exit(f"{pagina}: a API respondeu {erro.code}: {erro.read().decode(errors='replace')[:500]}")
            espera = 30 * (tentativa + 1)
            print(f"  limite da API ({erro.code}), tentando de novo em {espera} s", flush=True)
            time.sleep(espera)
    for parte in resposta.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in parte:
            return base64.b64decode(parte["inlineData"]["data"])
    sys.exit(f"{pagina}: a resposta não trouxe imagem: {json.dumps(resposta)[:500]}")


def reduzir(pagina: str) -> None:
    """Recorta o branco em volta do desenho, deixa uma margem igual e salva a versão do site."""
    with Image.open(ORIGINAIS / f"{pagina}.png") as imagem:
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
    destino = SITE / f"{pagina}.webp"
    destino.parent.mkdir(parents=True, exist_ok=True)
    quadro.resize((192, 192), Image.LANCZOS).save(destino, "WEBP", quality=88, method=6)


def paginas(nomes: list[str]) -> list[str]:
    """Aceita a chave inteira (jogos/sudoku) ou só o nome da página (sudoku)."""
    resultado = []
    for nome in nomes:
        achadas = [p for p in IMAGENS if p == nome or p.split("/")[1] == nome]
        if not achadas:
            sys.exit(f"Sem descrição para: {nome}. Opções: {', '.join(IMAGENS)}")
        resultado += achadas
    return resultado


def main() -> None:
    if sys.argv[1:2] == ["--reduzir"]:
        # Só refaz as versões do site a partir das originais já geradas
        for pagina in paginas(sys.argv[2:]) or [p for p in IMAGENS if (ORIGINAIS / f"{p}.png").exists()]:
            reduzir(pagina)
            print(f"  {SITE / f'{pagina}.webp'}")
        return
    endereco, cabecalhos = acesso()
    pedidos = paginas(sys.argv[1:]) or [p for p in IMAGENS if not (SITE / f"{p}.webp").exists()]
    for pagina in pedidos:
        print(f"gerando {pagina}...", flush=True)
        original = ORIGINAIS / f"{pagina}.png"
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_bytes(gerar(pagina, endereco, cabecalhos))
        reduzir(pagina)
        print(f"  {SITE / f'{pagina}.webp'}")
    print("pronto" if pedidos else "todas as imagens já existem; passe o nome de uma para refazer")


if __name__ == "__main__":
    main()
