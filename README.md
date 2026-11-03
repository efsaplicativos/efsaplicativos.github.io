# efsaplicativos.github.io
Portal oficial da EFS Aplicativos: conheça nossos aplicativos na Google Play, use as ferramentas e os jogos online e acesse nossos sites de jogos e entretenimento.

Endereço: https://efsaplicativos.com.br (o GitHub Pages redireciona efsaplicativos.github.io para lá).

## Estrutura

- `index.html`, `politica-privacidade.html`, `batalha-naval/`, `lance-certo/`: páginas feitas à mão.
- `_fonte/paginas/`: páginas das versões web (ferramentas, jogos, sobre, contato, privacidade do site).
- `_fonte/modelo.html`: cabeçalho, rodapé e `<head>` comuns a essas páginas.
- `assets/`: estilos e scripts das versões web. `assets/anuncios.js` guarda os IDs dos blocos do AdSense.
- `ads.txt` (AdSense), `app-ads.txt` (AdMob), `robots.txt` e `sitemap.xml`.

## Gerar as páginas

Depois de editar algo em `_fonte/` ou em `assets/`, rode na raiz do repositório:

```
python _fonte/gerar.py
```

Ele recria `ferramentas/`, `jogos/`, `sobre/`, `contato/`, `privacidade/` e o `sitemap.xml`, com a versão de cada CSS e JS no endereço para o navegador baixar de novo quando mudarem. Não edite as páginas geradas à mão: a próxima geração apaga a mudança.

Para testar no computador:

```
python -m http.server 8123
```

e abra http://localhost:8123. Em localhost nenhum anúncio real é carregado; com `?anuncios=teste` no endereço, aparecem caixas no lugar dos anúncios.
