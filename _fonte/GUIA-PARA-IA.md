# Guia do site EFS Aplicativos (para IAs e para quem for editar)

Entregue este arquivo a qualquer assistente de IA antes de pedir mudanças no site. Ele explica como o site
está montado, como publicar uma mudança e o que não pode ser quebrado.

## 1. O que é o site

- Portal da EFS Aplicativos: apresenta os apps Android do Google Play e tem 31 jogos e 40 ferramentas que
  funcionam direto no navegador.
- Endereço: **https://efsaplicativos.com.br**. O endereço antigo, efsaplicativos.github.io, redireciona
  para ele automaticamente, inclusive com o caminho da página.
- Hospedagem: GitHub Pages, no repositório `efsaplicativos/efsaplicativos.github.io`, branch `main`.
- Site estático: só HTML, CSS e JavaScript puro. Não há framework, `npm` nem servidor.
- Todo o texto do site é em português do Brasil.

## 2. Como publicar uma mudança

Toda mudança enviada para o branch `main` vai ao ar sozinha em cerca de 1 minuto. Não existe outro passo de
publicação.

1. Traga a versão mais recente: `git pull`. Isso é obrigatório se alguém editou algo direto no site do GitHub.
2. Faça a mudança, seguindo as regras da seção 4.
3. Rode o gerador na raiz do repositório: `python _fonte/gerar.py`.
4. Se mexeu na lógica de um jogo ou de uma ferramenta, rode o teste dele:
   `node _fonte/testes/<nome>.test.js`.
5. Teste no computador: rode `python -m http.server 8123` e abra http://localhost:8123. Confira o tema
   claro e o escuro, no computador e na largura de celular (360px).
6. Salve e envie: `git add -A`, `git commit -m "mensagem em português"`, `git push origin main`.
7. Depois de cerca de 1 minuto, abra https://efsaplicativos.com.br e confira. Se aparecer a versão antiga,
   recarregue a página.

Os commits são feitos com o autor `efsaplicativos <efsaplicativos@gmail.com>`.

## 3. Onde fica cada coisa

| Caminho | O que é | Como editar |
|---|---|---|
| `index.html` | Página inicial | À mão, direto no arquivo |
| `politica-privacidade.html` | Política de privacidade dos apps Android | À mão |
| `batalha-naval/`, `lance-certo/` | Privacidade e exclusão de conta de apps específicos | À mão |
| `_fonte/paginas/` | Conteúdo das páginas de jogos, ferramentas, sobre, contato e privacidade do site | Edite aqui e rode o gerador |
| `_fonte/modelo.html` | Cabeçalho, menu, rodapé e `<head>` comuns às páginas geradas | Edite aqui e rode o gerador |
| `ferramentas/`, `jogos/`, `sobre/`, `contato/`, `privacidade/`, `sitemap.xml` | Páginas **geradas** | **Nunca edite à mão**: o gerador apaga a mudança |
| `site.css`, `site.js` | Estilo, tema, menu e catálogo do site todo | À mão |
| `assets/web.css` | Estilo comum das páginas de jogos e ferramentas | À mão |
| `assets/jogos/`, `assets/ferramentas/` | CSS e JS de cada jogo e ferramenta. `<nome>-logica.js` tem as regras e `<nome>.js` cuida da tela | À mão |
| `assets/anuncios.js` | IDs dos blocos de anúncio do Google AdSense | À mão |
| `assets/indicacoes.js` | Produtos e links de afiliado da Amazon e do Mercado Livre (seção 9) | À mão |
| `assets/estatisticas.js` | Tag do Google (GTM-5C9R9438) do Google Analytics 4 (G-29Y6HZZ9M2). Só carrega em efsaplicativos.com.br, nunca em localhost | À mão |
| `_fonte/testes/` | Testes da lógica de cada página, sem dependências | À mão |
| `_fonte/ferramentas-dados/` | Scripts que geram dados das páginas e as imagens de cada jogo e ferramenta | À mão |
| `images/` | Imagens. As de jogos e ferramentas ficam em WebP | — |
| `ads.txt`, `app-ads.txt` | Autorização de anúncios (AdSense e AdMob) | Só se a conta de anúncios mudar |
| `CNAME` | Domínio do site | **Não mexa** (seção 4) |

O gerador `python _fonte/gerar.py` faz três coisas:
- transforma cada arquivo de `_fonte/paginas/` em uma página completa, usando o `_fonte/modelo.html`
  (`_fonte/paginas/jogos/sudoku.html` vira `jogos/sudoku/index.html`);
- refaz o `sitemap.xml`;
- coloca no endereço de cada CSS e JS uma versão (`?v=...`), inclusive no `index.html` e na
  `politica-privacidade.html`. Assim o navegador baixa o arquivo de novo quando ele muda.

Cada arquivo em `_fonte/paginas/` começa com um comentário de metadados (`titulo`, `descricao`, e, se
precisar, `scripts`, `estilos` e `app`). O início do `_fonte/gerar.py` explica cada um.

## 4. O que não pode ser quebrado

- **Não apague nem altere o arquivo `CNAME`.** Ele liga o site ao domínio efsaplicativos.com.br. Sem ele, o
  site volta a abrir só em efsaplicativos.github.io.
- **Não renomeie nem mova as páginas de privacidade.** As fichas dos apps no Google Play apontam para elas:
  - `politica-privacidade.html`
  - `batalha-naval/privacidade.html`
  - `batalha-naval/excluir-conta.html`
  - `lance-certo/privacidade.html`, `lance-certo/privacy.html` e `lance-certo/privacidad.html`

  Se um link desses quebrar, o Google Play pode reprovar ou remover o app.
- **Não crie `.nojekyll` nem `_config.yml`.** O GitHub Pages usa o Jekyll, que deixa de fora do site as pastas
  que começam com `_`. É isso que impede `_fonte/` de ser publicada.
- **Não edite as páginas geradas** listadas na seção 3. Edite em `_fonte/` e rode o gerador.
- **Não mexa no DNS** do domínio sem necessidade (seção 7).
- Mantenha as quebras de linha e a codificação (UTF-8) que cada arquivo já tem.

## 5. Visual e temas

- **Tema claro (padrão), em laranja.** As cores ficam em variáveis no `:root` do `site.css`: `--primary`,
  `--bg`, `--surface`, `--text`, `--link` e outras.
- **Tema escuro ("Noite de jogo").** O botão de lua no cabeçalho ativa o modo noturno, com as cores em
  `:root[data-theme="dark"]` no `site.css`. A escolha fica salva no navegador, em `localStorage`, com a chave
  `efs-theme`.
- **Use sempre as variáveis** (`var(--primary)`, `var(--text)`...), nunca uma cor fixa. Assim a mudança vale
  para os dois temas. Os CSS dos jogos usam `:root[data-theme="light"]` quando precisam de um ajuste só
  no tema claro.
- **Mantenha o contraste.** Texto normal precisa de pelo menos 4,5:1 contra o fundo, nos dois temas.
- **Fontes:** Baloo 2 nos títulos e Nunito no texto, carregadas do Google Fonts. A página
  `_fonte/paginas/privacidade.html` menciona o Google Fonts. Se trocar a origem das fontes, atualize essa
  página.
- **Celular:** confira tudo em 360px de largura. Nada pode passar da largura da tela.

## 6. Botões para baixar na loja

Cada app e jogo que tem versão no Google Play mostra um botão para baixar, sem precisar abrir a versão web:

- Página inicial, em "Escolha o seu momento": botão `a.momento-loja` ("Baixar") ao lado de cada item.
- Catálogo da página inicial ("Todos os aplicativos"): links `a.store-link.loja`.
- Cartões em `_fonte/paginas/jogos/index.html` e `_fonte/paginas/ferramentas/index.html`: links
  `a.store-link.loja` ("Baixar no Google Play").

O endereço de cada app vem do bloco `aside.cta-app` da página dele em `_fonte/paginas/`. A calculadora
financeira RPN não tem app, então não tem botão. Ao criar um jogo ou ferramenta novo, que tenha app,
acrescente o botão nos três lugares.

## 7. Domínio e DNS

- O domínio está registrado no **Registro.br**, com o DNS do próprio Registro.br no modo avançado.
- Registros configurados:
  - quatro registros A em `efsaplicativos.com.br`: 185.199.108.153, 185.199.109.153, 185.199.110.153 e
    185.199.111.153, que são os servidores do GitHub Pages;
  - um CNAME `www.efsaplicativos.com.br` apontando para `efsaplicativos.github.io`.
- No GitHub, em Settings → Pages, o domínio personalizado é `efsaplicativos.com.br`, com "Enforce HTTPS"
  ativado.
- Só o dono da conta faz login no Registro.br e no GitHub. Uma IA não deve pedir senhas.

## 8. Anúncios (Google AdSense)

- Os espaços de anúncio são `<div class="anuncio" data-bloco="..." hidden>`. Os IDs dos blocos ficam em
  `assets/anuncios.js`, e um espaço com o ID vazio continua escondido.
- **Os anúncios ficam sempre separados de botões, campos e tabuleiros por texto.** Um toque destinado ao
  jogo não pode cair no anúncio: foi esse tipo de clique acidental que levou à suspensão por tráfego
  inválido no AdMob.
- Em localhost nenhum anúncio real é carregado. Com `?anuncios=teste` no endereço, aparecem caixas no lugar
  dos anúncios.
- **Nunca clique em anúncios reais do próprio site**, nem para testar.
- A página de privacidade do site (`_fonte/paginas/privacidade.html`) explica os cookies de publicidade. Se
  a forma de anunciar mudar, atualize essa página.

## 9. Indicações de produtos (Amazon e Mercado Livre)

- Cada página de jogo e de ferramenta tem, logo depois do jogo ou da ferramenta e antes do texto (o "Como
  jogar" ou "Como usar"), um espaço `<aside class="indicacao" data-indicacao="<nome da página>" hidden>`.
  Nas ferramentas ele vem depois do anúncio `data-bloco="meio"`, para que o título e o aviso do quadro
  separem o anúncio dos botões das lojas. O nome da página é o nome do
  arquivo em `_fonte/paginas/`, sem `.html`.
- Os produtos ficam na lista `INDICACOES` de `assets/indicacoes.js`. Cada produto tem um nome, um texto curto
  e os campos `amazon` e `mercadolivre`, onde vai o link de afiliado.
- **Para colocar um link,** cole o link de afiliado no campo da loja. Na Amazon, use
  `naAmazon("<código do produto>")`, que monta o link `amazon.com.br/dp/<código>?tag=efsaplicativo-20` com o
  ID de associado. O código é o trecho de 10 caracteres depois de `/dp/` no endereço do produto. Ajuste o nome e
  o texto para combinar com o produto. Depois rode o gerador, para a versão do arquivo mudar nas páginas e o
  navegador baixar a lista nova.
- **No Mercado Livre,** o dono da conta gera o link: abre o produto logado, clica em **Gerar link** na barra
  de afiliado e copia só o "Link do produto" (`https://meli.la/...`). O ID do produto e o texto sugerido
  servem para redes sociais. O link curto abre o perfil social do afiliado com o produto em destaque no
  topo e o botão "Ir para produto". O Mercado Livre funciona assim; não é erro.
- **Antes de trocar um produto,** confira na Amazon se ele está disponível e bem avaliado. Não coloque preço
  nem característica que a página do produto não confirme.
- Produto sem link não aparece. Página sem nenhum link continua com o espaço escondido.
- Só são aceitos links `https` dos endereços das lojas: amazon.com.br, amzn.to, link.amazon (o link curto
  que a barra da Amazon gera hoje), mercadolivre.com.br, mercadolivre.com e meli.la. Um link fora disso é
  recusado e aparece um aviso no console do navegador.
- **Modo de teste:** com `?indicacoes=teste` no endereço, o quadro aparece com todos os produtos sugeridos,
  mesmo os que ainda não têm link.
- **Teste automático:** rode `node _fonte/testes/indicacoes.test.js` depois de mexer na lista.
- **Regras dos programas:**
  - O quadro sempre mostra o aviso de que são links de indicação. Quando há link da Amazon, mostra também a
    frase exigida pelo Programa de Associados: "Como associado da Amazon, ganho com compras qualificadas.".
  - Os links levam `rel="sponsored"`.
  - Não coloque preço nem foto copiada da loja: o preço muda, e as fotos só podem vir das ferramentas dos
    programas.
  - Compras feitas pelo próprio dono do site, ou pela família dele, pelos links não contam e violam o
    contrato da Amazon.
- A página de privacidade do site (`_fonte/paginas/privacidade.html`) explica os links de indicação.

## 10. Contato e redes

- E-mail de contato mostrado no site: efsaplicativos@hotmail.com.
- Redes sociais: YouTube https://www.youtube.com/@efsAplicativos e TikTok https://www.tiktok.com/@efsaplicativos.
- Página do desenvolvedor no Google Play:
  https://play.google.com/store/apps/developer?id=Efs+Aplicativos.
