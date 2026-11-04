# efsaplicativos.github.io
Portal oficial da EFS Aplicativos: conheça nossos aplicativos na Google Play, use as ferramentas e os jogos online e acesse nossos sites de jogos e entretenimento.

Endereço: https://efsaplicativos.com.br (o GitHub Pages redireciona efsaplicativos.github.io para lá).

## Estrutura

- `index.html`, `politica-privacidade.html`, `batalha-naval/`, `lance-certo/`: páginas feitas à mão.
- `_fonte/paginas/`: páginas das versões web (32 ferramentas, 13 jogos, sobre, contato, privacidade do site).
- `_fonte/modelo.html`: cabeçalho, rodapé e `<head>` comuns a essas páginas.
- `_fonte/testes/`: testes da lógica de cada página, sem dependências. Rode `node _fonte/testes/<página>.test.js`.
- `_fonte/ferramentas-dados/`: scripts que geram dados das páginas (os puzzles de xadrez vêm dos apps) e a
  imagem de cada ferramenta e jogo, em `images/ferramentas/` e `images/jogos/` (`imagens_paginas.py`).
- `assets/`: estilos e scripts das versões web. Em cada página, `<nome>-logica.js` tem as regras e os cálculos e
  `<nome>.js` cuida da tela. `assets/anuncios.js` guarda os IDs dos blocos do AdSense. `assets/estatisticas.js` guarda o ID do Google Analytics.
- `ads.txt` (AdSense), `app-ads.txt` (AdMob), `robots.txt` e `sitemap.xml`.

## Gerar as páginas

Depois de editar algo em `_fonte/` ou em `assets/`, rode na raiz do repositório:

```
python _fonte/gerar.py
```

Ele recria `ferramentas/`, `jogos/`, `sobre/`, `contato/`, `privacidade/` e o `sitemap.xml`, com a versão de cada CSS e JS no endereço para o navegador baixar de novo quando mudarem. Também atualiza a versão do `site.css` e do `site.js` no `index.html` e na `politica-privacidade.html`. Não edite as páginas geradas à mão: a próxima geração apaga a mudança.

O passo a passo completo para editar e publicar, e o que não pode ser quebrado (domínio, páginas de privacidade usadas pelo Google Play, anúncios), está em `_fonte/GUIA-PARA-IA.md`.

Para testar no computador:

```
python -m http.server 8123
```

e abra http://localhost:8123. Em localhost nenhum anúncio real é carregado e o Google Analytics não conta a visita; com `?anuncios=teste` no endereço, aparecem caixas no lugar dos anúncios.
