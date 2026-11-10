"""Gera as páginas das versões web (ferramentas e jogos) a partir de _fonte/paginas.

Uso, na raiz do repositório:

    python _fonte/gerar.py

Cada arquivo em _fonte/paginas começa com um comentário de metadados:

    <!--
    titulo: Título da página (vai no <title>)
    descricao: Descrição para os buscadores
    scripts: /assets/a.js /assets/b.js          (opcional)
    estilos: /assets/jogos/2048.css             (opcional)
    app: Nome do app | Categoria do schema.org   (opcional, gera os dados estruturados)
    -->

_fonte/paginas/ferramentas/imc.html vira ferramentas/imc/index.html (endereço /ferramentas/imc/),
e um index.html vira o index da própria pasta. O cabeçalho, o rodapé e o resto do <head> vêm de
_fonte/modelo.html. Também gera o sitemap.xml e atualiza a versão do site.css e do site.js nas
páginas feitas à mão (index.html e politica-privacidade.html), sem mexer no resto delas.

O GitHub Pages (Jekyll) não publica pastas que começam com "_", então _fonte fica só no repositório.
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

SITE = "https://efsaplicativos.com.br"
RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / "_fonte" / "paginas"
MODELO = (RAIZ / "_fonte" / "modelo.html").read_text(encoding="utf-8")

# Páginas feitas à mão que também entram no sitemap.xml
PAGINAS_FIXAS = ["/", "/politica-privacidade.html"]
# Páginas feitas à mão que carregam o site.css, o site.js e o assets/estatisticas.js
PAGINAS_A_MAO = ["index.html", "politica-privacidade.html"]
# Arquivos cujo ?v= é atualizado nas páginas feitas à mão
ARQUIVOS_A_MAO = r"site\.css|site\.js|assets/estatisticas\.js"


def versao(caminho: str) -> str:
    """Hash curto do arquivo, para o navegador baixar de novo quando ele mudar."""
    conteudo = (RAIZ / caminho.lstrip("/")).read_bytes()
    return hashlib.sha1(conteudo).hexdigest()[:12]


def ler(arquivo: Path) -> tuple[dict, str]:
    texto = arquivo.read_text(encoding="utf-8")
    cabecalho = re.match(r"<!--\n(.*?)\n-->\n", texto, re.S)
    if not cabecalho:
        raise SystemExit(f"{arquivo}: falta o comentário de metadados no início")
    meta = {}
    for linha in cabecalho.group(1).splitlines():
        chave, _, valor = linha.partition(":")
        meta[chave.strip()] = valor.strip()
    return meta, texto[cabecalho.end():]


def destino(arquivo: Path) -> tuple[Path, str]:
    relativo = arquivo.relative_to(FONTE)
    pasta = relativo.parent if relativo.name == "index.html" else relativo.with_suffix("")
    endereco = "/" if pasta == Path(".") else f"/{pasta.as_posix()}/"
    return RAIZ / pasta / "index.html", endereco


def dados_estruturados(meta: dict, url: str) -> str:
    if "app" not in meta:
        return ""
    nome, _, categoria = (parte.strip() for parte in meta["app"].partition("|"))
    dados = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": nome,
        "url": url,
        "description": meta["descricao"],
        "applicationCategory": categoria,
        "operatingSystem": "Qualquer navegador",
        "inLanguage": "pt-BR",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "BRL"},
        "publisher": {"@type": "Organization", "name": "EFS Aplicativos", "url": f"{SITE}/"},
    }
    return f'<script type="application/ld+json">{json.dumps(dados, ensure_ascii=False)}</script>'


def gerar(arquivo: Path) -> str:
    meta, corpo = ler(arquivo)
    saida, endereco = destino(arquivo)
    url = SITE + endereco
    scripts = "\n    ".join(
        f'<script src="{src}?v=[[v:{src}]]" defer></script>' for src in meta.get("scripts", "").split()
    )
    estilos = "\n    ".join(
        f'<link rel="stylesheet" href="{href}?v=[[v:{href}]]" />' for href in meta.get("estilos", "").split()
    )
    pagina = MODELO
    for chave, valor in {
        "aviso": f"Gerado por _fonte/gerar.py a partir de _fonte/paginas/{arquivo.relative_to(FONTE).as_posix()}. Edite lá.",
        "titulo": html.escape(meta["titulo"]),
        "descricao": html.escape(meta["descricao"]),
        "url": url,
        "estilos": estilos,
        "scripts": scripts,
        "dados": dados_estruturados(meta, url),
        "conteudo": corpo.strip(),
    }.items():
        pagina = pagina.replace(f"[[{chave}]]", valor)

    # Marca no menu a seção da página (ferramentas, jogos...)
    secao = endereco.strip("/").split("/")[0]
    if secao:
        pagina = pagina.replace(f'data-secao="{secao}"', f'data-secao="{secao}" aria-current="page"')

    pagina = re.sub(r"\[\[v:([^\]]+)\]\]", lambda m: versao(m.group(1)), pagina)
    # Imagens dos cartões: hash na URL, senão o navegador continua mostrando o ícone antigo depois de
    # trocar o arquivo (o mesmo ?v= que já existe em CSS e JS)
    pagina = re.sub(
        r'src="(/images/[^"]+?\.webp)(?:\?v=[0-9a-f]+)?"',
        lambda m: f'src="{m.group(1)}?v={versao(m.group(1)[1:])}"',
        pagina,
    )
    sobra = re.search(r"\[\[[^\]]+\]\]", pagina)
    if sobra:
        raise SystemExit(f"{arquivo}: marcador sem valor {sobra.group(0)}")

    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(pagina, encoding="utf-8", newline="\n")
    print(f"{endereco:32} {saida.relative_to(RAIZ).as_posix()}")
    return endereco


def atualizar_versoes(nome: str) -> None:
    """Troca só o ?v= dos ARQUIVOS_A_MAO; o arquivo mantém as quebras de linha (CRLF)."""
    arquivo = RAIZ / nome
    texto = arquivo.read_bytes().decode("utf-8")
    novo = re.sub(
        rf'((?:href|src)="({ARQUIVOS_A_MAO})\?v=)[0-9a-f]+"',
        lambda m: f'{m.group(1)}{versao(m.group(2))}"',
        texto,
    )
    # As imagens dos cartões também ganham ?v=, inclusive nas páginas feitas à mão
    novo = re.sub(
        r'src="(/images/[^"]+?\.webp)(?:\?v=[0-9a-f]+)?"',
        lambda m: f'src="{m.group(1)}?v={versao(m.group(1)[1:])}"',
        novo,
    )
    if novo != texto:
        arquivo.write_bytes(novo.encode("utf-8"))
    print(f"{'versões atualizadas' if novo != texto else 'versões em dia':32} {nome}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    enderecos = [gerar(arquivo) for arquivo in sorted(FONTE.rglob("*.html"))]
    linhas = "\n".join(f"  <url><loc>{SITE}{e}</loc></url>" for e in PAGINAS_FIXAS + enderecos)
    (RAIZ / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{linhas}\n</urlset>\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"sitemap.xml com {len(PAGINAS_FIXAS) + len(enderecos)} endereços")
    for nome in PAGINAS_A_MAO:
        atualizar_versoes(nome)


if __name__ == "__main__":
    main()
