"use strict";
/*
 * Interface do Marcador de Truco. As regras ficam em marcador-de-truco-logica.js (portadas de
 * RegrasTruco.kt); a tela segue ui/telas/TelaPartida.kt, partida/PainelDupla.kt, SeletorValor.kt,
 * AvisoMaoDeOnze.kt, CartaoVencedor.kt, FolhaAjustes.kt, componentes/FolhaNovaMesa.kt e
 * TelaHistorico.kt do app. O estado é gravado no mesmo JSON (versão 1) do EstadoJson.kt.
 */
(() => {
  const raiz = document.querySelector("#truco");
  if (!raiz || typeof LogicaTruco !== "object") return;
  const T = LogicaTruco;

  const CHAVE = "efs-marcador-de-truco-estado";
  const TEMPO_AVISO = 8000;
  const fuso = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (erro) {
      return undefined;
    }
  })();
  const podeVibrar = typeof navigator.vibrate === "function";

  const $ = (seletor) => raiz.querySelector(seletor);
  const el = {
    subtitulo: $("#truco-subtitulo"),
    desfazer: $("#truco-desfazer"),
    abrirAjustes: $("#truco-abrir-ajustes"),
    vitoriasTexto: $("#truco-vitorias-texto"),
    meta: $("#truco-meta"),
    vitorias: [$("#truco-vitorias-0"), $("#truco-vitorias-1")],
    aviso: $("#truco-aviso"),
    avisoTitulo: $("#truco-aviso-titulo"),
    avisoTexto: $("#truco-aviso-texto"),
    avisoBotoes: $("#truco-aviso-botoes"),
    valerTres: $("#truco-valer-tres"),
    correram: $("#truco-correram"),
    vencedor: $("#truco-vencedor"),
    vencedorSobre: $("#truco-vencedor-sobre"),
    vencedorTitulo: $("#truco-vencedor-titulo"),
    vencedorTexto: $("#truco-vencedor-texto"),
    continuar: $("#truco-continuar"),
    continuarTexto: $("#truco-continuar-texto"),
    paineis: [...raiz.querySelectorAll(".truco-dupla")],
    valor: $("#truco-valor"),
    valorNome: $("#truco-valor-nome"),
    radiosValor: [...raiz.querySelectorAll('input[name="truco-valor"]')],
    salvo: $("#truco-salvo"),
    status: $("#truco-status"),
    historicoTitulo: $("#truco-historico-titulo"),
    resumo: $("#truco-historico-resumo"),
    vazio: $("#truco-vazio"),
    lista: $("#truco-lista"),
    toast: $("#truco-toast"),
    limpar: $("#truco-limpar"),
    dialogoMesa: $("#truco-dialogo-mesa"),
    formMesa: $("#truco-form-mesa"),
    nomesMesa: [$("#truco-mesa-nome-0"), $("#truco-mesa-nome-1")],
    radiosFormato: [...raiz.querySelectorAll('input[name="truco-formato"]')],
    dialogoAjustes: $("#truco-dialogo-ajustes"),
    formAjustes: $("#truco-form-ajustes"),
    nomesAjustes: [$("#truco-ajustes-nome-0"), $("#truco-ajustes-nome-1")],
    vibracaoLinha: $("#truco-vibracao-linha"),
    vibracao: $("#truco-vibracao"),
    zerar: $("#truco-zerar"),
    novaMesa: $("#truco-nova-mesa"),
    dialogoConfirmar: $("#truco-dialogo-confirmar"),
    confirmarTitulo: $("#truco-confirmar-titulo"),
    confirmarTexto: $("#truco-confirmar-texto"),
    confirmarOk: $("#truco-confirmar-ok"),
    confirmarCancelar: $("#truco-confirmar-cancelar"),
  };

  // Mesmo formato de id do JogoViewModel.kt: instante + 6 caracteres aleatórios
  function novoId() {
    let sufixo = "";
    try {
      sufixo = crypto.randomUUID().slice(0, 6);
    } catch (erro) {
      sufixo = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
    }
    return `${Date.now()}-${sufixo}`;
  }

  function carregar() {
    let lido = null;
    try {
      lido = T.deJson(localStorage.getItem(CHAVE) ?? "");
    } catch (erro) {
      lido = null;
    }
    const base = lido ?? T.estadoInicial(true);
    if (base.mesa) return { estado: base, novo: false };
    // Sem mesa salva, já abre uma mesa padrão para marcar na hora (o app pede para preparar antes)
    return {
      estado: T.iniciar(base, novoId(), [T.NOME_PADRAO_1, T.NOME_PADRAO_2], "MELHOR_DE_3"),
      novo: true,
    };
  }

  const carregado = carregar();
  let estado = carregado.estado;
  let historicoDesenhado = null;

  function salvar() {
    try {
      localStorage.setItem(CHAVE, T.paraJson(estado));
      el.salvo.textContent = "Mesa salva neste navegador. Pode voltar quando quiser.";
    } catch (erro) {
      el.salvo.textContent = "Este navegador não deixou salvar: o placar some ao fechar a página.";
    }
  }

  /** Aplica o novo estado; devolve false quando a ação não mudou nada. */
  function aplicar(novo) {
    if (novo === estado) return false;
    estado = novo;
    salvar();
    desenhar();
    return true;
  }

  function vibrar(ms) {
    if (!podeVibrar || !estado.vibracao) return;
    try {
      navigator.vibrate(ms);
    } catch (erro) {
      // Alguns navegadores bloqueiam a vibração sem avisar
    }
  }
  const toqueLeve = () => vibrar(10);
  const toqueConfirmar = () => vibrar(25);

  // ---------- Avisos para leitores de tela ----------

  let temporizadorStatus = 0;
  function anunciar(texto) {
    clearTimeout(temporizadorStatus);
    el.status.textContent = "";
    // Limpar antes garante que a mesma frase seja lida de novo
    temporizadorStatus = setTimeout(() => {
      el.status.textContent = texto;
    }, 60);
  }

  function textoPlacar() {
    const { duplas, progresso } = estado.mesa;
    const partes = [`Placar: ${duplas[0]} ${progresso.placar[0]}, ${duplas[1]} ${progresso.placar[1]}.`];
    if (progresso.vencedor !== null) {
      partes.unshift(`Vitória para ${duplas[progresso.vencedor]}!`);
    } else if (!el.aviso.hidden) {
      partes.push(`${el.avisoTitulo.textContent}.`);
    }
    return partes.join(" ");
  }

  // ---------- Botões que podem ficar indisponíveis com o foco neles ----------

  // aria-disabled em vez de disabled: o foco não se perde quando o botão deixa de valer
  function habilitar(botao, sim) {
    if (sim) botao.removeAttribute("aria-disabled");
    else botao.setAttribute("aria-disabled", "true");
  }
  const desabilitado = (botao) => botao.getAttribute("aria-disabled") === "true";

  const visivel = (elemento) => Boolean(elemento) && elemento.isConnected && !elemento.closest("[hidden]");

  // Quando o elemento com foco some (display: none), o navegador devolve o foco ao <body>
  const focoPerdido = () => document.activeElement === document.body || !visivel(document.activeElement);

  function focar(elemento, reserva) {
    const alvo = visivel(elemento) && !elemento.disabled ? elemento : reserva;
    if (alvo && visivel(alvo)) alvo.focus();
  }

  // ---------- Desenho da mesa ----------

  for (const painel of el.paineis) {
    const pontinhos = painel.querySelector("[data-pontinhos]");
    for (let i = 0; i < T.PONTOS_PARA_VENCER; i++) pontinhos.append(document.createElement("span"));
  }

  const botaoDoPainel = (dupla, acao) => el.paineis[dupla].querySelector(`[data-acao="${acao}"]`);

  function desenhar() {
    const mesa = estado.mesa;
    const progresso = mesa.progresso;
    const terminada = progresso.vencedor !== null;
    const meta = T.metaDaDisputa(mesa.formato);

    el.subtitulo.textContent = `${T.FORMATOS[mesa.formato].rotulo} · Partida ${progresso.numeroPartida}`;
    habilitar(el.desfazer, mesa.desfazer.length > 0);

    el.meta.textContent = meta;
    el.vitorias[0].textContent = progresso.vitorias[0];
    el.vitorias[1].textContent = progresso.vitorias[1];
    el.vitoriasTexto.textContent =
      `Vitórias: ${mesa.duplas[0]} ${progresso.vitorias[0]}, ${mesa.duplas[1]} ${progresso.vitorias[1]}. ${meta}.`;

    desenharAviso(mesa);
    desenharVencedor(mesa);

    el.paineis.forEach((painel, dupla) => {
      const nome = mesa.duplas[dupla];
      const pontos = progresso.placar[dupla];
      painel.querySelector("[data-nome]").textContent = nome;
      botaoDoPainel(dupla, "nome").setAttribute("aria-label", `Editar nome de ${nome}`);
      painel.querySelector("[data-pontos]").textContent = pontos;
      painel.querySelector("[data-pontos-texto]").textContent = `${nome}: ${T.pontos(pontos)}`;
      painel.querySelectorAll("[data-pontinhos] span").forEach((ponto, indice) => {
        ponto.classList.toggle("aceso", indice < pontos);
      });

      const marcar = botaoDoPainel(dupla, "marcar");
      marcar.textContent = `+${T.pontos(progresso.valorMao)}`;
      marcar.setAttribute("aria-label", `Marcar ${T.pontos(progresso.valorMao)} para ${nome}`);
      habilitar(marcar, !terminada);
      const menos = botaoDoPainel(dupla, "menos");
      menos.setAttribute("aria-label", `Remover 1 ponto de ${nome}`);
      habilitar(menos, !terminada && pontos > 0);
      const mais = botaoDoPainel(dupla, "mais");
      mais.setAttribute("aria-label", `Adicionar 1 ponto para ${nome}`);
      habilitar(mais, !terminada);
    });

    el.valor.hidden = terminada;
    el.valorNome.textContent = T.nomeDoValor(progresso.valorMao);
    for (const radio of el.radiosValor) radio.checked = Number(radio.value) === progresso.valorMao;

    if (historicoDesenhado !== estado.historico) desenharHistorico();
  }

  function desenharAviso(mesa) {
    const progresso = mesa.progresso;
    const duplaComOnze = T.duplaNaMaoDeOnze(progresso);
    const ferro = T.emMaoDeFerro(progresso);
    el.aviso.hidden = duplaComOnze === null && !ferro;
    if (duplaComOnze !== null) {
      const quemDecide = mesa.duplas[duplaComOnze];
      const outra = mesa.duplas[T.adversario(duplaComOnze)];
      el.avisoTitulo.textContent = `Mão de 11 · ${quemDecide}`;
      el.avisoTexto.textContent =
        `${quemDecide} decide se joga. Aceitando, a mão vale 3; correndo, ${outra} ganha 1 ponto.`;
      el.avisoBotoes.hidden = false;
      el.valerTres.textContent = progresso.valorMao === 3 ? "Valendo 3" : "Vão jogar: vale 3";
      habilitar(el.valerTres, progresso.valorMao !== 3);
      el.correram.textContent = `Correram: +1 para ${outra}`;
    } else if (ferro) {
      el.avisoTitulo.textContent = "Mão de ferro · 11 a 11";
      el.avisoTexto.textContent =
        "Decidam na mesa como jogar a mão de ferro. Quem vencer esta mão leva a partida.";
      el.avisoBotoes.hidden = true;
    }
  }

  function desenharVencedor(mesa) {
    const progresso = mesa.progresso;
    el.vencedor.hidden = progresso.vencedor === null;
    if (progresso.vencedor === null) return;
    const encerrada = T.campeao(mesa) !== null;
    el.vencedorSobre.textContent = encerrada ? "A disputa tem dono" : "Mais uma pra conta";
    // "Vitória para" concorda com qualquer nome de dupla ("Nós", "Eles", "Joca e Bia")
    el.vencedorTitulo.textContent = `Vitória para ${mesa.duplas[progresso.vencedor]}!`;
    el.vencedorTexto.textContent = encerrada
      ? "Boa partida. A revanche já pode começar."
      : "Resultado registrado. Vamos para a próxima?";
    el.continuarTexto.textContent = encerrada ? "Jogar novamente" : "Próxima partida";
  }

  // ---------- Histórico ----------

  function criar(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function itemHistorico(resultado, agora) {
    const data = T.data(resultado.terminouEm, agora, fuso);
    const vencedor = resultado.duplas[resultado.vencedor];
    const item = criar("li", "truco-item");

    const info = criar("div", "truco-item-info");
    info.append(
      criar("p", "truco-item-titulo", `Vitória para ${vencedor}`),
      criar("p", "truco-item-detalhe", `${data} · ${T.FORMATOS[resultado.formato].rotulo}`),
      criar(
        "p",
        "truco-item-detalhe",
        `${resultado.duplas[0]} × ${resultado.duplas[1]} · Partida ${resultado.numeroPartida}`,
      ),
    );

    const placar = criar("p", "truco-item-placar");
    placar.append(
      criar(
        "span",
        "sr-only",
        `Placar: ${resultado.duplas[0]} ${resultado.placar[0]}, ${resultado.duplas[1]} ${resultado.placar[1]}`,
      ),
    );
    const visual = criar("span");
    visual.setAttribute("aria-hidden", "true");
    resultado.placar.forEach((pontos, dupla) => {
      if (dupla === 1) visual.append(criar("span", "truco-item-separador", " : "));
      visual.append(criar("span", dupla === resultado.vencedor ? "venceu" : "", String(pontos)));
    });
    placar.append(visual);

    const excluir = criar("button", "truco-item-excluir", "Excluir");
    excluir.type = "button";
    excluir.dataset.id = resultado.id;
    excluir.setAttribute(
      "aria-label",
      `Excluir partida ${resultado.numeroPartida} de ${data}, vitória para ${vencedor}`,
    );

    item.append(info, placar, excluir);
    return item;
  }

  function desenharHistorico() {
    const historico = estado.historico;
    historicoDesenhado = historico;
    el.resumo.hidden = historico.length === 0;
    el.resumo.textContent = `${T.partidas(historico.length)} pra contar.`;
    el.vazio.hidden = historico.length > 0;
    el.limpar.hidden = historico.length === 0;
    const agora = Date.now();
    el.lista.replaceChildren(...historico.map((resultado) => itemHistorico(resultado, agora)));
  }

  // Aviso com "Desfazer", como o snackbar do app
  let temporizadorAviso = 0;

  function mostrarAvisoDesfazer(texto, aoDesfazer) {
    clearTimeout(temporizadorAviso);
    const caixa = criar("div", "truco-toast-caixa");
    const botao = criar("button", "truco-toast-desfazer", "Desfazer");
    botao.type = "button";
    botao.addEventListener("click", () => {
      esconderAviso();
      aoDesfazer();
    });
    caixa.append(criar("span", "", texto), botao);
    el.toast.replaceChildren(caixa);
    agendarFimDoAviso(TEMPO_AVISO);
  }

  function agendarFimDoAviso(ms) {
    temporizadorAviso = setTimeout(() => {
      // Não some enquanto a pessoa está com o foco ou o mouse sobre ele
      if (el.toast.contains(document.activeElement) || el.toast.matches(":hover")) {
        agendarFimDoAviso(3000);
        return;
      }
      esconderAviso();
    }, ms);
  }

  function esconderAviso() {
    clearTimeout(temporizadorAviso);
    el.toast.replaceChildren();
  }

  el.lista.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-id]");
    if (!botao) return;
    const posicao = estado.historico.findIndex((resultado) => resultado.id === botao.dataset.id);
    if (posicao < 0) return;
    const resultado = estado.historico[posicao];
    aplicar(T.excluirResultado(estado, resultado.id));
    toqueLeve();

    // O foco passa para a partida que ficou no lugar (ou a de cima), ou para o título
    const botoes = el.lista.querySelectorAll("button[data-id]");
    focar(botoes[posicao] ?? botoes[posicao - 1], el.historicoTitulo);

    mostrarAvisoDesfazer("Partida excluída.", () => {
      if (!aplicar(T.restaurarResultado(estado, resultado, posicao))) return;
      const restaurado = [...el.lista.querySelectorAll("button[data-id]")].find(
        (candidato) => candidato.dataset.id === resultado.id,
      );
      focar(restaurado, el.historicoTitulo);
      anunciar("Partida restaurada.");
    });
  });

  el.limpar.addEventListener("click", () => {
    const quantidade = estado.historico.length;
    if (quantidade === 0) return;
    confirmar({
      titulo: "Excluir todo o histórico?",
      texto:
        `Você vai apagar ${T.partidas(quantidade)} ${quantidade === 1 ? "salva" : "salvas"}. ` +
        "O placar e as vitórias da mesa atual serão mantidos. Essa ação não pode ser desfeita.",
      botao: "Excluir todas",
      aoConfirmar: () => {
        esconderAviso();
        aplicar(T.limparHistorico(estado));
        el.historicoTitulo.focus();
        anunciar("Histórico apagado.");
      },
    });
  });

  // ---------- Diálogos ----------

  const retornos = new Map();
  const dialogoNativo = (dialogo) => typeof dialogo.showModal === "function";

  function abrirDialogo(dialogo, foco, volta = document.activeElement) {
    retornos.set(dialogo, volta);
    if (dialogoNativo(dialogo)) {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute("open", "");
    }
    if (foco) foco.focus();
  }

  function fecharDialogo(dialogo) {
    if (dialogoNativo(dialogo)) {
      if (dialogo.open) dialogo.close();
    } else if (dialogo.hasAttribute("open")) {
      dialogo.removeAttribute("open");
      aoFecharDialogo(dialogo);
    }
  }

  function aoFecharDialogo(dialogo) {
    if (!retornos.has(dialogo)) return;
    const volta = retornos.get(dialogo);
    retornos.delete(dialogo);
    focar(volta, el.abrirAjustes);
  }

  /** Fecha um diálogo e abre outro, mantendo o foco de volta no botão que abriu o primeiro. */
  function trocarDialogo(de, para, foco) {
    const volta = retornos.get(de);
    retornos.delete(de);
    fecharDialogo(de);
    abrirDialogo(para, foco, volta);
  }

  /** Fecha sem devolver o foco: quem chamou decide para onde ele vai. */
  function encerrarDialogo(dialogo) {
    const volta = retornos.get(dialogo);
    retornos.delete(dialogo);
    fecharDialogo(dialogo);
    return volta;
  }

  for (const dialogo of [el.dialogoMesa, el.dialogoAjustes, el.dialogoConfirmar]) {
    dialogo.addEventListener("close", () => aoFecharDialogo(dialogo));
    dialogo.addEventListener("keydown", (evento) => {
      // Sem showModal (navegador antigo), o Esc precisa ser tratado aqui
      if (evento.key === "Escape" && !dialogoNativo(dialogo)) {
        evento.preventDefault();
        fecharDialogo(dialogo);
      }
    });
    // Clique no fundo escuro, fora do conteúdo, fecha (só se o clique também começou no fundo,
    // para não fechar ao arrastar a seleção de um campo para fora)
    let comecouNoFundo = false;
    dialogo.addEventListener("pointerdown", (evento) => {
      comecouNoFundo = evento.target === dialogo;
    });
    dialogo.addEventListener("click", (evento) => {
      if (comecouNoFundo && evento.target === dialogo) fecharDialogo(dialogo);
      comecouNoFundo = false;
    });
    for (const botao of dialogo.querySelectorAll("[data-fechar]")) {
      botao.addEventListener("click", () => fecharDialogo(dialogo));
    }
  }

  let acaoConfirmada = null;

  function confirmar({ titulo, texto, botao, aoConfirmar }, trocarDe = null) {
    el.confirmarTitulo.textContent = titulo;
    el.confirmarTexto.textContent = texto;
    el.confirmarOk.textContent = botao;
    acaoConfirmada = aoConfirmar;
    if (trocarDe) trocarDialogo(trocarDe, el.dialogoConfirmar, el.confirmarCancelar);
    else abrirDialogo(el.dialogoConfirmar, el.confirmarCancelar);
  }

  el.confirmarCancelar.addEventListener("click", () => fecharDialogo(el.dialogoConfirmar));
  el.confirmarOk.addEventListener("click", () => {
    const acao = acaoConfirmada;
    acaoConfirmada = null;
    const volta = encerrarDialogo(el.dialogoConfirmar);
    if (acao) acao(volta);
  });

  // Nomes: até 20 caracteres contados por code point, sem partir emoji (CamposDuplas.kt)
  function limitarNome(campo) {
    const pontos = Array.from(campo.value.replace(/[\r\n]/g, ""));
    if (pontos.length > T.TAMANHO_MAXIMO_NOME) campo.value = pontos.slice(0, T.TAMANHO_MAXIMO_NOME).join("");
  }

  for (const [primeiro, segundo] of [el.nomesMesa, el.nomesAjustes]) {
    for (const campo of [primeiro, segundo]) campo.addEventListener("input", () => limitarNome(campo));
    // Enter no primeiro nome passa para o segundo, como o "Próximo" do teclado no app
    primeiro.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        segundo.focus();
      }
    });
  }

  function abrirAjustes(dupla = null) {
    const mesa = estado.mesa;
    const progresso = mesa.progresso;
    el.nomesAjustes[0].value = mesa.duplas[0];
    el.nomesAjustes[1].value = mesa.duplas[1];
    el.vibracaoLinha.hidden = !podeVibrar;
    el.vibracao.checked = estado.vibracao;
    el.zerar.disabled = progresso.vencedor !== null || (progresso.placar[0] === 0 && progresso.placar[1] === 0);
    const foco = dupla === null ? el.dialogoAjustes.querySelector("[data-fechar]") : el.nomesAjustes[dupla];
    abrirDialogo(el.dialogoAjustes, foco);
    if (dupla !== null) el.nomesAjustes[dupla].select();
  }

  function prepararNovaMesa() {
    const mesa = estado.mesa;
    el.nomesMesa[0].value = mesa ? mesa.duplas[0] : T.NOME_PADRAO_1;
    el.nomesMesa[1].value = mesa ? mesa.duplas[1] : T.NOME_PADRAO_2;
    const formato = mesa ? mesa.formato : "MELHOR_DE_3";
    for (const radio of el.radiosFormato) radio.checked = radio.value === formato;
  }

  function abrirNovaMesa() {
    prepararNovaMesa();
    abrirDialogo(el.dialogoMesa, el.nomesMesa[0]);
  }

  el.abrirAjustes.addEventListener("click", () => abrirAjustes());

  el.formAjustes.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const volta = encerrarDialogo(el.dialogoAjustes);
    aplicar(T.renomear(estado, [el.nomesAjustes[0].value, el.nomesAjustes[1].value]));
    focar(volta, el.abrirAjustes);
    anunciar(`Nomes salvos: ${estado.mesa.duplas[0]} e ${estado.mesa.duplas[1]}.`);
  });

  el.vibracao.addEventListener("change", () => {
    aplicar(T.definirVibracao(estado, el.vibracao.checked));
    toqueLeve();
  });

  el.zerar.addEventListener("click", () => {
    confirmar(
      {
        titulo: "Zerar esta partida?",
        texto:
          "Os pontos voltam a zero. As vitórias da disputa e o histórico ficam guardados. " +
          "Você também pode desfazer essa ação.",
        botao: "Zerar pontos",
        aoConfirmar: (volta) => {
          aplicar(T.zerarPlacar(estado));
          focar(volta, el.abrirAjustes);
          anunciar(`Pontos zerados. ${textoPlacar()}`);
        },
      },
      el.dialogoAjustes,
    );
  });

  el.novaMesa.addEventListener("click", () => {
    prepararNovaMesa();
    trocarDialogo(el.dialogoAjustes, el.dialogoMesa, el.nomesMesa[0]);
  });

  el.formMesa.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const escolhido = el.radiosFormato.find((radio) => radio.checked);
    const formato = escolhido ? escolhido.value : "MELHOR_DE_3";
    encerrarDialogo(el.dialogoMesa);
    aplicar(T.iniciar(estado, novoId(), [el.nomesMesa[0].value, el.nomesMesa[1].value], formato));
    toqueConfirmar();
    botaoDoPainel(0, "marcar").focus();
    const mesa = estado.mesa;
    anunciar(`Mesa nova: ${mesa.duplas[0]} contra ${mesa.duplas[1]}, ${T.FORMATOS[mesa.formato].rotulo}.`);
  });

  // ---------- Jogadas ----------

  function marcarMao(dupla) {
    if (!aplicar(T.marcarMao(estado, dupla, Date.now()))) return;
    toqueConfirmar();
    depoisDeMarcar(dupla);
  }

  function depoisDeMarcar(dupla) {
    if (estado.mesa.progresso.vencedor !== null) {
      // O placar trava; o próximo passo é o botão do cartão de vitória
      el.continuar.focus();
    } else if (focoPerdido()) {
      botaoDoPainel(dupla, "marcar").focus();
    }
    anunciar(textoPlacar());
  }

  function ajustar(dupla, delta) {
    if (!aplicar(T.ajustar(estado, dupla, delta, Date.now()))) return;
    toqueLeve();
    depoisDeMarcar(dupla);
  }

  for (const [dupla, painel] of el.paineis.entries()) {
    painel.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-acao]");
      if (!botao || desabilitado(botao)) return;
      const acao = botao.dataset.acao;
      if (acao === "nome") abrirAjustes(dupla);
      else if (acao === "marcar") marcarMao(dupla);
      else if (acao === "menos") ajustar(dupla, -1);
      else if (acao === "mais") ajustar(dupla, 1);
    });
  }

  for (const radio of el.radiosValor) {
    radio.addEventListener("change", () => {
      if (aplicar(T.escolherValor(estado, Number(radio.value)))) toqueLeve();
    });
  }

  el.valerTres.addEventListener("click", () => {
    if (desabilitado(el.valerTres)) return;
    if (!aplicar(T.escolherValor(estado, 3))) return;
    toqueLeve();
    anunciar("A mão vale 3.");
  });

  el.correram.addEventListener("click", () => {
    const duplaComOnze = T.duplaNaMaoDeOnze(estado.mesa.progresso);
    if (duplaComOnze === null) return;
    const outra = T.adversario(duplaComOnze);
    if (!aplicar(T.marcar(estado, outra, 1, Date.now()))) return;
    toqueConfirmar();
    depoisDeMarcar(outra);
  });

  function desfazer() {
    if (!aplicar(T.desfazer(estado))) return;
    toqueLeve();
    if (focoPerdido()) el.desfazer.focus();
    anunciar(`Jogada desfeita. ${textoPlacar()}`);
  }

  el.desfazer.addEventListener("click", () => {
    if (!desabilitado(el.desfazer)) desfazer();
  });

  el.continuar.addEventListener("click", () => {
    if (T.campeao(estado.mesa) !== null) {
      abrirNovaMesa();
      return;
    }
    if (!aplicar(T.proximaPartida(estado))) return;
    toqueLeve();
    botaoDoPainel(0, "marcar").focus();
    anunciar(`Partida ${estado.mesa.progresso.numeroPartida}. Placar zerado.`);
  });

  // Ctrl+Z (ou Cmd+Z) desfaz a última jogada, fora dos campos de texto e dos diálogos
  document.addEventListener("keydown", (evento) => {
    if (!(evento.ctrlKey || evento.metaKey) || evento.shiftKey || evento.altKey) return;
    if (evento.key !== "z" && evento.key !== "Z") return;
    const alvo = evento.target;
    if (alvo instanceof Element && alvo.closest("input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable]")) return;
    if (retornos.size > 0 || raiz.querySelector("dialog[open]")) return;
    evento.preventDefault();
    desfazer();
  });

  // Outra aba com o marcador aberto gravou um estado novo: acompanha
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CHAVE || evento.newValue === null) return;
    const lido = T.deJson(evento.newValue);
    if (!lido || !lido.mesa) return;
    estado = lido;
    desenhar();
  });

  desenhar();
  if (carregado.novo) salvar();
})();
