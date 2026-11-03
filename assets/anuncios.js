"use strict";
/*
 * Blocos de anúncio do Google AdSense.
 *
 * Cada página marca onde pode haver anúncio com <div class="anuncio" data-bloco="..." hidden>,
 * sempre separado por texto de botões, campos e tabuleiros, para um toque destinado ao jogo ou
 * à ferramenta não cair no anúncio (foi o que levou à suspensão por tráfego inválido no AdMob).
 *
 * Os IDs dos blocos são criados no AdSense em Anúncios → Por bloco de anúncios → Anúncios de
 * display. Enquanto o ID de um bloco estiver vazio, aquele espaço continua escondido.
 *
 * Em localhost nenhum anúncio real é carregado, para não gerar impressões nem cliques seus.
 * Para ver onde os anúncios vão ficar, abra a página com ?anuncios=teste no endereço.
 */
(() => {
  const CLIENTE = "ca-pub-4599982617961569";
  const BLOCOS = {
    meio: "",
    fim: "",
  };

  const espacos = document.querySelectorAll(".anuncio[data-bloco]");
  if (!espacos.length) return;

  let teste = false;
  try {
    teste = new URLSearchParams(location.search).get("anuncios") === "teste";
  } catch (error) {
    teste = false;
  }
  if (teste) {
    for (const espaco of espacos) {
      espaco.hidden = false;
      espaco.classList.add("anuncio-teste");
      espaco.textContent = `Espaço de anúncio (${espaco.dataset.bloco})`;
    }
    return;
  }

  // file:// tem hostname vazio
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  if (local) return;

  let carregar = false;
  for (const espaco of espacos) {
    const bloco = BLOCOS[espaco.dataset.bloco];
    if (!bloco) continue;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.dataset.adClient = CLIENTE;
    ins.dataset.adSlot = bloco;
    ins.dataset.adFormat = "auto";
    ins.dataset.fullWidthResponsive = "true";
    espaco.append(ins);
    espaco.hidden = false;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    carregar = true;
  }
  if (!carregar) return;

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENTE}`;
  document.head.append(script);
})();
