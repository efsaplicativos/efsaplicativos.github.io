"use strict";
/** Hub dos desafios do dia: data de hoje, selo por jogo concluído e o botão de recomeçar. */
(() => {
  const raiz = document.querySelector(".desafios");
  if (!raiz || typeof Diario !== "object") return;
  const D = Diario;

  const textoData = raiz.querySelector("#ds-data");
  const textoProgresso = raiz.querySelector("#ds-progresso");
  const botaoLimpar = raiz.querySelector("#ds-limpar");
  const botaoCompartilhar = raiz.querySelector("#ds-compartilhar");
  const aviso = raiz.querySelector("#ds-aviso");
  const itens = [...raiz.querySelectorAll(".ds-item")];

  const NOMES = {
    sudoku: "Sudoku",
    "campo-minado": "Campo Minado",
    "caca-palavras": "Caça-palavras",
    "quebra-cabeca": "Quebra-cabeça",
    mahjong: "Mahjong",
    soletra: "Soletra",
  };

  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function hojePorExtenso() {
    const agora = new Date();
    return `${agora.getDate()} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`;
  }

  function desenhar() {
    let feitos = 0;
    const feitosPorJogo = [];
    for (const item of itens) {
      const jogo = item.dataset.jogo;
      const feito = Boolean(jogo) && D.concluido(jogo);
      if (feito) feitos++;
      feitosPorJogo.push([jogo, feito]);
      item.classList.toggle("feito", feito);
      const selo = item.querySelector(".ds-selo");
      if (selo) selo.hidden = !feito;
    }
    textoData.textContent = `Desafios de ${hojePorExtenso()}`;
    textoProgresso.textContent = feitos === itens.length
      ? `Todos os ${itens.length} desafios de hoje estão feitos`
      : `${feitos} de ${itens.length} desafios feitos`;
    textoProgresso.classList.toggle("tudo-feito", feitos === itens.length);
    if (botaoLimpar) botaoLimpar.hidden = feitos === 0;
    if (botaoCompartilhar) botaoCompartilhar.hidden = feitos === 0;
    if (aviso && feitos === 0) aviso.textContent = "";
    return { feitos, total: itens.length, feitosPorJogo };
  }

  if (botaoCompartilhar && typeof Compartilhar === "object") {
    Compartilhar.ligar(botaoCompartilhar, () => {
      const { feitos, total, feitosPorJogo } = desenhar();
      const detalhes = feitosPorJogo.map(([jogo, feito]) => `${NOMES[jogo] || jogo} ${feito ? Compartilhar.FEITO : Compartilhar.FALTA}`);
      return Compartilhar.resumo({
        titulo: `Desafios do dia ${Compartilhar.dataCurta()}`,
        placar: `${Compartilhar.marcas(feitosPorJogo.map(([, feito]) => feito))} ${feitos} de ${total}`,
        detalhes: [detalhes.join(" · ")],
        endereco: `${Compartilhar.SITE}/desafios/`,
      });
    }, { rotulo: "Copiar resultado", aviso });
  } else if (botaoCompartilhar) {
    botaoCompartilhar.hidden = true;
  }

  botaoLimpar?.addEventListener("click", () => {
    for (const item of itens) if (item.dataset.jogo) D.limpar(item.dataset.jogo);
    desenhar();
    textoProgresso.textContent = "Marcas do dia apagadas: pode fazer os desafios de novo.";
  });

  // Ao voltar de um jogo, o navegador restaura a página do histórico: atualiza os selos
  window.addEventListener("pageshow", desenhar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") desenhar();
  });

  desenhar();
})();
