"use strict";
/** Jogo da forca: desenho que cresce a cada erro, teclado na tela e teclado físico. */
(() => {
  const raiz = document.querySelector("[data-jogo='forca']");
  if (!raiz || typeof LogicaForca !== "object") return;
  const $ = (seletor) => raiz.querySelector(seletor);
  const F = LogicaForca;
  const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const desenho = $("#fc-desenho");
  const partes = [...raiz.querySelectorAll(".fc-parte")];
  const palavra = $("#fc-palavra");
  const dica = $("#fc-dica");
  const erros = $("#fc-erros");
  const mensagem = $("#fc-mensagem");
  const teclado = $("#fc-teclado");
  const seletorTema = $("#fc-tema");
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("forca", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao($("#fc-som"));

  let partida = null;
  const botoes = new Map();

  for (const letra of LETRAS) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "fc-tecla";
    botao.dataset.letra = letra;
    botao.textContent = letra;
    botao.setAttribute("aria-label", `Letra ${letra}`);
    teclado.append(botao);
    botoes.set(letra, botao);
  }

  function render() {
    const escondidas = F.mascara(partida);
    palavra.textContent = escondidas.join(" ");
    dica.textContent = partida.dica;
    erros.textContent = `Erros: ${partida.erros} de ${F.MAX_ERROS}`;
    desenho.dataset.erros = String(partida.erros);
    for (const parte of partes) parte.classList.toggle("is-visivel", partida.erros >= Number(parte.dataset.desde));

    for (const [letra, botao] of botoes) {
      const usada = partida.letras.includes(letra);
      botao.disabled = usada || partida.terminada;
      botao.classList.toggle("is-certa", usada && partida.palavra.includes(letra));
      botao.classList.toggle("is-errada", usada && !partida.palavra.includes(letra));
    }

    if (partida.vitoria) mensagem.textContent = `Você acertou! A palavra era ${partida.palavra.toLowerCase()}.`;
    else if (partida.derrota) mensagem.textContent = `Seus erros acabaram. A palavra era ${partida.palavra.toLowerCase()}.`;
    else if (partida.letras.length === 0) mensagem.textContent = "Escolha uma letra para começar.";
    else mensagem.textContent = "Continue: as letras certas aparecem na palavra.";

    raiz.dataset.jogo = partida.terminada ? "fim" : partida.letras.length ? "ativo" : "parado";
  }

  function tentar(letra) {
    if (!partida || partida.terminada) return;
    const antes = partida;
    partida = F.tentar(partida, letra);
    if (partida === antes) return;
    if (partida.vitoria) som.tocar("vitoria");
    else if (partida.derrota) som.tocar("derrota");
    else if (partida.erros > antes.erros) som.tocar("erro");
    else som.tocar("acerto");
    render();
  }

  function novo() {
    partida = F.iniciar({ tema: seletorTema.value });
    render();
    som.tocar("toque");
  }

  teclado.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".fc-tecla");
    if (botao) tentar(botao.dataset.letra);
  });

  $("#fc-novo").addEventListener("click", novo);
  seletorTema.addEventListener("change", novo);

  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (document.activeElement === seletorTema) return;
    const letra = evento.key.toUpperCase();
    if (!/^[A-Z]$/.test(letra) || letra.length !== 1) return;
    if (evento.key.length !== 1) return;
    tentar(letra);
  });

  novo();
})();
