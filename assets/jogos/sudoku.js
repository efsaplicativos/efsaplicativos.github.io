"use strict";
/*
 * Interface do Sudoku. Regras e gerador em sudoku-logica.js; o fluxo segue
 * ui/telas/jogo/JogoViewModel.kt do Sudoku Master: desfazer guarda até 200 jogadas (volta números
 * e notas, mas erros e dicas continuam contando), a dica usa a casa escolhida ou uma vazia ao
 * acaso, e o tempo só corre com o jogo visível. Partida e recordes ficam no localStorage.
 */
(() => {
  const raiz = document.querySelector(".sudoku");
  if (!raiz || typeof LogicaSudoku !== "object") return;
  const S = LogicaSudoku;

  const CHAVE_PARTIDA = "efs-sudoku-partida";
  const CHAVE_RECORDES = "efs-sudoku-recordes";
  const MAX_HISTORICO = 200;
  const TRAVA_DIALOGO_MS = 500;

  const gradeEl = raiz.querySelector("#sd-grade");
  const textoErros = raiz.querySelector("#sd-erros");
  const textoTempo = raiz.querySelector("#sd-tempo");
  const textoRecorde = raiz.querySelector("#sd-recorde");
  const botaoPausa = raiz.querySelector("#sd-pausa");
  const painelPausado = raiz.querySelector("#sd-pausado");
  const botaoContinuar = raiz.querySelector("#sd-continuar");
  const botaoNovo = raiz.querySelector("#sd-novo");
  const botaoDesfazer = raiz.querySelector("#sd-desfazer");
  const botaoApagar = raiz.querySelector("#sd-apagar");
  const botaoNotas = raiz.querySelector("#sd-notas");
  const botaoDica = raiz.querySelector("#sd-dica");
  const textoDicas = raiz.querySelector("#sd-dicas");
  const teclas = [...raiz.querySelectorAll("[data-numero]")];
  const botoesNivel = [...raiz.querySelectorAll("[data-nivel]")];
  const status = raiz.querySelector("#sd-status");
  const dialogo = raiz.querySelector("#sd-dialogo");
  const dialogoTitulo = raiz.querySelector("#sd-dialogo-titulo");
  const dialogoTexto = raiz.querySelector("#sd-dialogo-texto");
  const dialogoDados = raiz.querySelector("#sd-dialogo-dados");
  const dialogoBotoes = raiz.querySelector("#sd-dialogo-botoes");
  // Sem a biblioteca de sons (script que não carregou), o jogo continua, só que mudo
  const som = typeof Sons === "object" ? Sons.criar("sudoku", raiz) : { tocar() {}, ligarBotao() {} };
  som.ligarBotao(raiz.querySelector("#sd-som"));

  let jogo = null;
  let selecionada = null;
  let modoNotas = false;
  let pausado = false;
  let venceu = false;
  let historico = [];
  let recordes = { facil: [], medio: [], dificil: [] };
  let acumuladoMs = 0;
  let inicioTrecho = null;
  let tique = null;
  let casas = [];

  // ---------- Armazenamento ----------

  function lerJson(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave));
    } catch (erro) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      /* Armazenamento indisponível: vale só enquanto a página estiver aberta. */
    }
  }

  function salvar() {
    if (!jogo || venceu) return;
    jogo = { ...jogo, tempoMs: decorridoMs() };
    gravar(CHAVE_PARTIDA, jogo);
  }

  // ---------- Cronômetro ----------

  const decorridoMs = () => acumuladoMs + (inicioTrecho === null ? 0 : performance.now() - inicioTrecho);

  function atualizarCronometro() {
    const deveCorrer = jogo && !pausado && !venceu && document.visibilityState === "visible";
    if (deveCorrer && inicioTrecho === null) {
      inicioTrecho = performance.now();
      tique = setInterval(() => (textoTempo.textContent = S.formatarTempo(decorridoMs() / 1000)), 250);
    } else if (!deveCorrer && inicioTrecho !== null) {
      acumuladoMs = decorridoMs();
      inicioTrecho = null;
      clearInterval(tique);
    }
    textoTempo.textContent = S.formatarTempo(decorridoMs() / 1000);
  }

  // ---------- Desenho ----------

  /** 9 quadrados com 9 casas cada; as bordas grossas ficam entre os quadrados. */
  function montarGrade() {
    casas = new Array(S.CASAS);
    const blocos = [];
    for (let b = 0; b < 9; b++) {
      const bloco = document.createElement("div");
      bloco.className = "sd-bloco";
      for (let k = 0; k < 9; k++) {
        const i = S.indice(Math.floor(b / 3) * 3 + Math.floor(k / 3), (b % 3) * 3 + (k % 3));
        const casa = document.createElement("button");
        casa.type = "button";
        casa.className = "sd-casa";
        casa.dataset.i = String(i);
        casa.tabIndex = -1;
        casas[i] = casa;
        bloco.append(casa);
      }
      blocos.push(bloco);
    }
    gradeEl.replaceChildren(...blocos);
  }

  function descrever(i, conflitos) {
    const posicao = `Linha ${S.linha(i) + 1}, coluna ${S.coluna(i) + 1}`;
    const valor = jogo.valores[i];
    if (S.fixa(jogo, i)) return `${posicao}: ${valor}, pista`;
    if (valor !== S.VAZIA) {
      const extra = S.errada(jogo, i) ? ", errado" : conflitos.has(i) ? ", repetido" : "";
      return `${posicao}: ${valor}${extra}`;
    }
    const notas = [];
    for (let n = 1; n <= 9; n++) if (S.temNota(jogo, i, n)) notas.push(n);
    return notas.length ? `${posicao}: vazia, notas ${notas.join(", ")}` : `${posicao}: vazia`;
  }

  function desenhar() {
    const conflitos = venceu ? new Set() : S.conflitos(jogo.valores);
    const valorSelecionado = selecionada === null ? S.VAZIA : jogo.valores[selecionada];
    for (let i = 0; i < S.CASAS; i++) {
      const casa = casas[i];
      const valor = jogo.valores[i];
      let fundo = "";
      if (i === selecionada) fundo = "selecionada";
      else if (conflitos.has(i)) fundo = "conflito";
      else if (valorSelecionado !== S.VAZIA && valor === valorSelecionado) fundo = "mesmo";
      else if (selecionada !== null && S.saoVizinhas(i, selecionada)) fundo = "regiao";
      const tipo = S.fixa(jogo, i) ? "fixa" : S.errada(jogo, i) ? "errada" : valor ? "jogador" : "";
      const classe = `sd-casa ${fundo} ${tipo}`.trim();
      if (casa.className !== classe) casa.className = classe;

      // Conteúdo: o número ou a grade 3 × 3 de notas
      const chave = valor ? `v${valor}` : `n${jogo.notas[i]}:${valorSelecionado}`;
      if (casa.dataset.chave !== chave) {
        casa.dataset.chave = chave;
        if (valor) {
          casa.textContent = String(valor);
        } else if (jogo.notas[i]) {
          const notas = document.createElement("span");
          notas.className = "sd-notas";
          for (let n = 1; n <= 9; n++) {
            const nota = document.createElement("span");
            if (S.temNota(jogo, i, n)) {
              nota.textContent = String(n);
              if (n === valorSelecionado) nota.className = "destacada";
            }
            notas.append(nota);
          }
          casa.replaceChildren(notas);
        } else {
          casa.textContent = "";
        }
      }
      casa.setAttribute("aria-label", descrever(i, conflitos));
      casa.tabIndex = i === (selecionada ?? 0) ? 0 : -1;
    }

    const interativo = !pausado && !venceu;
    const completos = S.numerosCompletos(jogo);
    for (const tecla of teclas) {
      const n = Number(tecla.dataset.numero);
      tecla.disabled = !interativo || completos.has(n);
      tecla.setAttribute("aria-label", modoNotas ? `Nota ${n}` : `Número ${n}`);
    }
    raiz.classList.toggle("notas-ativas", modoNotas);
    botaoNotas.setAttribute("aria-pressed", String(modoNotas));
    botaoNotas.classList.toggle("ativo", modoNotas);
    botaoDesfazer.disabled = !interativo || historico.length === 0;
    botaoApagar.disabled = !interativo;
    botaoNotas.disabled = !interativo;
    const restantes = S.dicasRestantes(jogo);
    textoDicas.textContent = String(restantes);
    botaoDica.disabled = !interativo || restantes === 0;
    botaoDica.setAttribute("aria-label", `Dica, ${restantes} ${restantes === 1 ? "restante" : "restantes"}`);
    textoErros.textContent = String(jogo.erros);
    textoErros.classList.toggle("com-erros", jogo.erros > 0);
    painelPausado.hidden = !pausado;
    gradeEl.classList.toggle("oculta", pausado);
    botaoPausa.disabled = venceu;
    botaoPausa.textContent = pausado ? "Continuar" : "Pausar";
    botaoPausa.setAttribute("aria-pressed", String(pausado));
    for (const botao of botoesNivel) {
      const ativo = botao.dataset.nivel === jogo.nivel;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    const melhor = recordes[jogo.nivel][0];
    textoRecorde.textContent = melhor ? S.formatarTempo(melhor.segundos) : "--:--";
    atualizarCronometro();
  }

  // ---------- Diálogo ----------

  let aoCancelarDialogo = null;

  function abrirDialogo({ titulo, texto, dados = [], botoes, aoCancelar }) {
    dialogoTitulo.textContent = titulo;
    dialogoTexto.textContent = texto;
    dialogoDados.replaceChildren(
      ...dados.map(([rotulo, valor, destaque]) => {
        const linha = document.createElement("div");
        if (destaque) linha.className = "destaque";
        const dt = document.createElement("dt");
        dt.textContent = rotulo;
        const dd = document.createElement("dd");
        dd.textContent = valor;
        linha.append(dt, dd);
        return linha;
      }),
    );
    dialogoDados.hidden = dados.length === 0;
    dialogoBotoes.replaceChildren(
      ...botoes.map(({ rotulo, acao, secundario }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = secundario ? "button secondary" : "button";
        botao.textContent = rotulo;
        botao.addEventListener("click", () => {
          fecharDialogo();
          acao();
        });
        return botao;
      }),
    );
    aoCancelarDialogo = aoCancelar || null;
    if (!dialogo.open) dialogo.showModal();
    dialogo.classList.add("travado");
    setTimeout(() => dialogo.classList.remove("travado"), TRAVA_DIALOGO_MS);
    status.textContent = `${titulo}. ${texto}`;
  }

  function fecharDialogo() {
    aoCancelarDialogo = null;
    if (dialogo.open) dialogo.close();
  }

  dialogo.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    const acao = aoCancelarDialogo;
    fecharDialogo();
    acao?.();
  });

  // ---------- Partida ----------

  /** `silencioso`: o jogo criado ao abrir a página, sem nenhuma ação da pessoa. */
  function novoJogo(nivelId, { silencioso = false } = {}) {
    fecharDialogo();
    const nivel = S.NIVEIS[nivelId];
    jogo = S.novoJogo(nivel, S.gerar(nivel));
    selecionada = null;
    modoNotas = false;
    pausado = false;
    venceu = false;
    historico = [];
    if (inicioTrecho !== null) clearInterval(tique);
    inicioTrecho = null;
    acumuladoMs = 0;
    salvar();
    desenhar();
    status.textContent = `Novo jogo no nível ${nivel.nome}, com ${nivel.casasVazias} casas vazias.`;
    if (!silencioso) som.tocar("inicio");
  }

  /** Um jogo com alguma jogada feita pede confirmação antes de ser trocado. */
  function confirmarNovoJogo(nivelId) {
    const mexeu = jogo && !venceu && (historico.length > 0 || jogo.erros > 0 || jogo.dicasUsadas > 0 ||
      jogo.valores.some((v, i) => v !== jogo.enunciado[i]) || jogo.notas.some(Boolean));
    if (!mexeu) {
      novoJogo(nivelId);
      return;
    }
    abrirDialogo({
      titulo: "Começar um novo jogo?",
      texto: "O progresso da partida atual será perdido.",
      botoes: [
        { rotulo: "Começar", acao: () => novoJogo(nivelId) },
        { rotulo: "Cancelar", acao: () => {}, secundario: true },
      ],
    });
  }

  const interativo = () => jogo && !pausado && !venceu;

  function aplicar(novo, { registrar = true, casa = selecionada } = {}) {
    if (novo === jogo) return;
    if (registrar) {
      historico.push(jogo);
      if (historico.length > MAX_HISTORICO) historico.shift();
    }
    jogo = novo;
    selecionada = casa;
    if (S.concluido(jogo)) {
      concluir();
      return;
    }
    salvar();
    desenhar();
  }

  function concluir() {
    // Só uma jogada (número ou dica) completa a grade: a vitória substitui o som dela
    som.tocar("vitoria");
    acumuladoMs = decorridoMs();
    inicioTrecho = null;
    clearInterval(tique);
    venceu = true;
    selecionada = null;
    modoNotas = false;
    historico = [];
    const segundos = Math.max(1, Math.floor(acumuladoMs / 1000));
    const { lista, posicao } = S.inserirRecorde(recordes[jogo.nivel], { segundos, data: Date.now() });
    recordes = { ...recordes, [jogo.nivel]: lista };
    gravar(CHAVE_RECORDES, recordes);
    gravar(CHAVE_PARTIDA, null);
    desenhar();
    textoTempo.textContent = S.formatarTempo(segundos);
    const nivel = S.NIVEIS[jogo.nivel];
    const dados = [];
    if (posicao === 0) dados.push(["Novo recorde!", nivel.nome, true]);
    dados.push(["Tempo", S.formatarTempo(segundos)], ["Erros", String(jogo.erros)], ["Dicas usadas", String(jogo.dicasUsadas)]);
    abrirDialogo({
      titulo: "Parabéns!",
      texto: `Você completou o Sudoku ${nivel.nome}.`,
      dados,
      botoes: [
        { rotulo: "Novo jogo", acao: () => novoJogo(jogo.nivel) },
        { rotulo: "Ver a grade", acao: () => {}, secundario: true },
      ],
    });
  }

  function selecionar(i, focar = true) {
    if (!interativo()) return;
    selecionada = i;
    desenhar();
    if (focar) casas[i].focus({ preventScroll: true });
  }

  /** A casa acabou de fechar uma linha, coluna ou quadrado inteiro com os números certos? */
  function fechouGrupo(i) {
    return [S.linha, S.coluna, S.bloco].some((grupo) => {
      for (let j = 0; j < S.CASAS; j++) if (grupo(j) === grupo(i) && !S.correta(jogo, j)) return false;
      return true;
    });
  }

  function digitar(numero) {
    if (!interativo() || selecionada === null) return;
    const i = selecionada;
    const antes = jogo;
    aplicar(modoNotas ? S.alternarNota(jogo, i, numero) : S.colocar(jogo, i, numero));
    // Jogada sem efeito fica muda; a que resolve a grade já tocou a vitória em concluir()
    if (jogo === antes || venceu) return;
    if (modoNotas) {
      som.tocar("anotar");
      return;
    }
    const errado = S.errada(jogo, i);
    status.textContent = errado ? `${numero} não é o número desta casa.` : `${numero} colocado.`;
    som.tocar(errado ? "erro" : fechouGrupo(i) ? "completo" : "numero");
  }

  function apagar() {
    if (!interativo() || selecionada === null) return;
    const antes = jogo;
    aplicar(S.apagar(jogo, selecionada));
    if (jogo !== antes) som.tocar("apagar");
  }

  function dica() {
    if (!interativo() || S.dicasRestantes(jogo) === 0) return;
    const opcoes = S.casasParaDica(jogo);
    const alvo = selecionada !== null && S.editavel(jogo, selecionada)
      ? selecionada
      : opcoes[Math.floor(Math.random() * opcoes.length)];
    if (alvo === undefined) return;
    aplicar(S.aplicarDica(jogo, alvo), { casa: alvo });
    if (!venceu) {
      status.textContent = `Dica: ${jogo.valores[alvo]} na linha ${S.linha(alvo) + 1}, coluna ${S.coluna(alvo) + 1}.`;
      casas[alvo].focus({ preventScroll: true });
      som.tocar("dica");
    }
  }

  function desfazer() {
    if (!interativo() || historico.length === 0) return;
    const anterior = historico.pop();
    // Volta números e notas; erros e dicas usadas continuam contando
    aplicar({ ...jogo, valores: anterior.valores, notas: anterior.notas }, { registrar: false });
    status.textContent = "Jogada desfeita.";
    som.tocar("desfazer");
  }

  function alternarNotas() {
    if (!interativo()) return;
    modoNotas = !modoNotas;
    desenhar();
    status.textContent = modoNotas ? "Notas ativadas." : "Notas desativadas.";
  }

  function pausar() {
    if (!interativo()) return;
    pausado = true;
    desenhar();
    salvar();
    status.textContent = "Jogo pausado.";
  }

  function continuar() {
    if (!jogo || venceu) return;
    pausado = false;
    desenhar();
    casas[selecionada ?? 0].focus({ preventScroll: true });
  }

  // ---------- Controles ----------

  gradeEl.addEventListener("click", (evento) => {
    const casa = evento.target.closest(".sd-casa");
    if (casa) selecionar(Number(casa.dataset.i));
  });
  // Chegar a uma casa pelo Tab também a escolhe
  gradeEl.addEventListener("focusin", (evento) => {
    const casa = evento.target.closest(".sd-casa");
    if (casa && Number(casa.dataset.i) !== selecionada) selecionar(Number(casa.dataset.i), false);
  });

  for (const tecla of teclas) tecla.addEventListener("click", () => digitar(Number(tecla.dataset.numero)));
  botaoApagar.addEventListener("click", apagar);
  botaoDesfazer.addEventListener("click", desfazer);
  botaoNotas.addEventListener("click", alternarNotas);
  botaoDica.addEventListener("click", dica);
  botaoPausa.addEventListener("click", () => (pausado ? continuar() : pausar()));
  botaoContinuar.addEventListener("click", continuar);
  botaoNovo.addEventListener("click", () => confirmarNovoJogo(jogo.nivel));
  for (const botao of botoesNivel) botao.addEventListener("click", () => confirmarNovoJogo(botao.dataset.nivel));

  // O teclado físico vale com o foco dentro do jogo, para não atrapalhar a rolagem da página
  raiz.addEventListener("keydown", (evento) => {
    if (dialogo.open || evento.altKey || evento.metaKey) return;
    const tecla = evento.key || "";
    if ((evento.ctrlKey && tecla.toLowerCase() === "z") || (!evento.ctrlKey && tecla.toLowerCase() === "u")) {
      evento.preventDefault();
      desfazer();
      return;
    }
    if (evento.ctrlKey) return;
    if (/^[1-9]$/.test(tecla)) {
      evento.preventDefault();
      digitar(Number(tecla));
    } else if (tecla === "Backspace" || tecla === "Delete" || tecla === "0") {
      evento.preventDefault();
      apagar();
    } else if (tecla === "n" || tecla === "N") {
      evento.preventDefault();
      alternarNotas();
    } else if (tecla.startsWith("Arrow") && evento.target.closest?.(".sd-casa")) {
      evento.preventDefault();
      const atual = selecionada ?? 0;
      const l = S.linha(atual);
      const c = S.coluna(atual);
      const destino = {
        ArrowUp: S.indice((l + 8) % 9, c),
        ArrowDown: S.indice((l + 1) % 9, c),
        ArrowLeft: S.indice(l, (c + 8) % 9),
        ArrowRight: S.indice(l, (c + 1) % 9),
      }[tecla];
      selecionar(destino);
    }
  });

  // Fora da tela o jogo pausa, como no app quando ele vai para segundo plano
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pausar();
    atualizarCronometro();
  });
  window.addEventListener("pagehide", salvar);

  // ---------- Início ----------

  const salvos = lerJson(CHAVE_RECORDES);
  if (salvos && typeof salvos === "object") {
    for (const id of Object.keys(recordes)) recordes[id] = S.lerRecordes(salvos[id]);
  }
  montarGrade();
  const salvo = lerJson(CHAVE_PARTIDA);
  if (S.jogoValido(salvo) && !S.concluido(salvo)) {
    // A partida salva volta pausada, como no app depois de reaberto
    jogo = salvo;
    acumuladoMs = salvo.tempoMs;
    pausado = true;
    desenhar();
  } else {
    novoJogo("medio", { silencioso: true });
  }
})();
