"use strict";
/** Soletra: sete letras, a do meio obrigatória, palavras de 3 letras ou mais e bônus de pangrama. */
(() => {
  const raiz = document.querySelector(".soletra");
  if (!raiz || typeof LogicaSoletra !== "object") return;
  const S = LogicaSoletra;
  const $ = (seletor) => raiz.querySelector(seletor);

  const letrasEl = $("#sl-letras");
  const entradaEl = $("#sl-entrada");
  const listaEl = $("#sl-lista");
  const pontosEl = $("#sl-pontos");
  const placarEl = $("#sl-placar");
  const mensagem = $("#sl-mensagem");
  const botaoEnviar = $("#sl-enviar");
  const botaoApagar = $("#sl-apagar");
  const botaoNova = $("#sl-nova");
  const botaoDiario = $("#sl-diario");
  const botaoCompartilhar = $("#sl-compartilhar");
  const avisoCompartilhar = $("#sl-aviso");
  // Modo diário (assets/jogos/diario.js): a mesma rodada para todos no dia
  const D = typeof Diario === "object" ? Diario : null;
  if (!D && botaoDiario) botaoDiario.hidden = true;
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("soletra", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao($("#sl-som"));

  let rodada = null;
  let digitada = "";
  let modoDiario = false;

  function desenhar() {
    const { letras, meio } = rodada;
    const fora = letras.filter((l) => l !== meio);
    letrasEl.textContent = "";
    // Três letras, a central, três letras: a do meio fica no centro do hexágono
    [fora[0], fora[1], fora[2], meio, fora[3], fora[4], fora[5]].forEach((letra) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = letra === meio ? "sl-letra sl-central" : "sl-letra";
      botao.dataset.letra = letra;
      botao.textContent = letra;
      botao.setAttribute("aria-label", letra === meio ? `Letra central ${letra}, obrigatória` : `Letra ${letra}`);
      letrasEl.append(botao);
    });

    entradaEl.textContent = digitada || "…";
    pontosEl.textContent = String(rodada.pontos);
    placarEl.textContent = `${rodada.achadas.length} de ${rodada.possiveis.length} palavras`;
    botaoEnviar.disabled = digitada.length < S.MIN_LETRAS_PALAVRA;

    const grupos = new Map();
    for (const achada of rodada.achadas) {
      if (!grupos.has(achada.palavra.length)) grupos.set(achada.palavra.length, []);
      grupos.get(achada.palavra.length).push(achada);
    }
    listaEl.textContent = "";
    for (const tamanho of [...grupos.keys()].sort((a, b) => a - b)) {
      const linha = document.createElement("p");
      linha.className = "sl-grupo";
      const titulo = document.createElement("strong");
      titulo.textContent = `${tamanho} letras`;
      linha.append(titulo, " ");
      for (const achada of grupos.get(tamanho)) {
        const marca = document.createElement("span");
        marca.className = achada.pangrama ? "sl-palavra sl-pangrama" : "sl-palavra";
        marca.textContent = achada.palavra.toLowerCase();
        marca.title = achada.pangrama ? `Pangrama: ${achada.pontos} pontos` : `${achada.pontos} ponto(s)`;
        linha.append(marca);
      }
      listaEl.append(linha);
    }
    if (!rodada.achadas.length) {
      const vazio = document.createElement("p");
      vazio.className = "sl-vazio";
      vazio.textContent = modoDiario
        ? "Ainda sem palavras nesta rodada do dia."
        : "Nenhuma palavra ainda: comece pela letra do meio.";
      listaEl.append(vazio);
    }

    if (S.completa(rodada)) {
      let texto = `Rodada completa! ${rodada.pontos} pontos, ${rodada.pangramas} pangrama(s).`;
      raiz.dataset.jogo = "fim";
      if (modoDiario && D) {
        D.marcarConcluido("soletra");
        texto += " O soletra de hoje está feito.";
      }
      mensagem.textContent = texto;
      if (botaoCompartilhar) botaoCompartilhar.hidden = false;
    } else {
      raiz.dataset.jogo = rodada.achadas.length ? "ativo" : "parado";
      if (botaoCompartilhar) botaoCompartilhar.hidden = true;
    }
  }

  if (botaoCompartilhar && typeof Compartilhar === "object") {
    Compartilhar.ligar(botaoCompartilhar, () => Compartilhar.resumo({
      titulo: `${modoDiario ? "Soletra do dia" : "Soletra"} ${Compartilhar.dataCurta()}`,
      placar: `${rodada.achadas.length} palavras · ${rodada.pontos} pontos · ${rodada.pangramas} pangrama(s)`,
      detalhes: [`Letras: ${rodada.letras.join(" ")} (${rodada.meio} no centro)`],
      endereco: `${Compartilhar.SITE}/jogos/soletra/`,
    }), { rotulo: "Compartilhar", aviso: avisoCompartilhar });
  } else if (botaoCompartilhar) {
    botaoCompartilhar.hidden = true;
  }

  function digitar(letra) {
    if (S.completa(rodada) || digitada.length >= 12) return;
    digitada += letra;
    desenhar();
    som.tocar("toque");
  }

  function enviar() {
    if (S.completa(rodada) || digitada.length < S.MIN_LETRAS_PALAVRA) return;
    const antes = rodada;
    rodada = S.tentar(rodada, digitada);
    if (rodada === antes) {
      mensagem.textContent = S.motivo(antes, digitada);
      som.tocar("erro");
    } else {
      const ultima = rodada.achadas[rodada.achadas.length - 1];
      mensagem.textContent = ultima.pangrama
        ? `Pangrama! Você usou as sete letras: +${ultima.pontos} pontos.`
        : `${ultima.palavra.toLowerCase()}: +${ultima.pontos} ponto(s).`;
      som.tocar(ultima.pangrama ? "vitoria" : "acerto");
    }
    digitada = "";
    desenhar();
  }

  function nova(diario = false) {
    modoDiario = Boolean(diario) && Boolean(D);
    rodada = S.iniciar({ aleatorio: modoDiario ? D.doDia("soletra").gerador : Math.random });
    digitada = "";
    const cabeca = modoDiario ? `Rodada do dia ${D.doDia("soletra").data}` : "Rodada nova";
    mensagem.textContent = `${cabeca}: palavras de ${S.MIN_LETRAS_PALAVRA} letras ou mais, sempre com a letra ${rodada.meio}.`;
    desenhar();
  }

  letrasEl.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".sl-letra");
    if (botao) digitar(botao.dataset.letra);
  });
  botaoApagar.addEventListener("click", () => {
    digitada = digitada.slice(0, -1);
    desenhar();
  });
  botaoEnviar.addEventListener("click", enviar);
  botaoNova.addEventListener("click", () => nova(false));
  botaoDiario?.addEventListener("click", () => nova(true));

  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (evento.key === "Backspace") {
      evento.preventDefault();
      digitada = digitada.slice(0, -1);
      desenhar();
      return;
    }
    if (evento.key === "Enter") {
      evento.preventDefault();
      enviar();
      return;
    }
    const letra = evento.key.toUpperCase();
    if (letra.length === 1 && /^[A-Z]$/.test(letra) && rodada.letras.includes(letra)) digitar(letra);
  });

  nova(false);
})();
