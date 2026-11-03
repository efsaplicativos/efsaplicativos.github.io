"use strict";
/*
 * Interface da calculadora financeira RPN. O motor fica em calculadora-financeira-rpn-logica.js;
 * a tela segue ui/CalculatorScreen.kt, ui/CalculatorViewModel.kt e ui/MenuDialog.kt do app:
 * visor com indicadores, painel com a pilha ou os registradores financeiros, teclado de 39
 * teclas, execução de programas com pausa (PSE) e a memória guardada entre as visitas.
 */
(() => {
  const raiz = document.querySelector("#calculadora-rpn");
  if (!raiz) return;

  const R = LogicaRpn;
  const motor = new R.Motor();
  const teclado = raiz.querySelector("#rpn-teclado");
  const texto = raiz.querySelector("#rpn-texto");
  const expoente = raiz.querySelector("#rpn-expoente");
  const legenda = raiz.querySelector("#rpn-legenda");
  const leitura = raiz.querySelector("#rpn-leitura");
  const indicadores = Object.fromEntries(
    [...raiz.querySelectorAll("[data-indicador]")].map((el) => [el.dataset.indicador, el]),
  );
  const prefixoExtra = raiz.querySelector("#rpn-prefixo");
  const painel = raiz.querySelector("#rpn-painel");
  const linhasPainel = raiz.querySelector("#rpn-painel-linhas");
  const botoesPainel = raiz.querySelectorAll("[data-painel]");
  const dialogo = document.querySelector("#rpn-ajustes");
  const ajustesPrincipal = dialogo.querySelector("#rpn-ajustes-principal");
  const ajustesConfirmar = dialogo.querySelector("#rpn-ajustes-confirmar");
  const campoVirgula = dialogo.querySelector("#rpn-virgula");
  const campoVibrar = dialogo.querySelector("#rpn-vibrar");
  const botoesPainelAjuste = dialogo.querySelectorAll("[data-painel-ajuste]");

  const CHAVE_MEMORIA = "efs-calculadora-financeira-rpn-memoria";
  const CHAVE_PREFERENCIAS = "efs-calculadora-financeira-rpn-preferencias";
  const PAUSA_MS = 1000;
  const MENSAGEM_MS = 1500;
  const EXECUCAO_MINIMA_MS = 300;
  const PAINEIS = ["pilha", "tvm", "oculto"];

  // ---------- Memória e preferências ----------

  function lerJson(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave));
    } catch {
      return null;
    }
  }

  function gravarJson(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Sem armazenamento: a calculadora funciona, só não lembra de nada na próxima visita.
    }
  }

  const memoria = lerJson(CHAVE_MEMORIA);
  if (memoria && memoria.versao === 1 && typeof memoria.estado === "string") motor.restaurar(memoria.estado);

  const prefs = lerJson(CHAVE_PREFERENCIAS);
  const preferencias = {
    painel: prefs && PAINEIS.includes(prefs.painel) ? prefs.painel : "pilha",
    vibrar: Boolean(prefs && prefs.vibrar === true),
  };

  const salvar = () => gravarJson(CHAVE_MEMORIA, { versao: 1, estado: motor.salvar() });
  const salvarPreferencias = () => gravarJson(CHAVE_PREFERENCIAS, preferencias);

  // ---------- Teclado na tela ----------

  const botoes = new Map();

  function criarTecla(tecla) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "rpn-tecla";
    if (tecla === R.Tecla.F) botao.classList.add("rpn-tecla-f");
    else if (tecla === R.Tecla.G) botao.classList.add("rpn-tecla-g");
    else if (tecla === R.Tecla.ON) botao.classList.add("rpn-tecla-on");
    else if (tecla.digito >= 0 || tecla === R.Tecla.DOT) botao.classList.add("rpn-tecla-digito");
    if (tecla === R.Tecla.ENTER) botao.classList.add("rpn-tecla-enter");
    botao.dataset.codigo = String(tecla.codigo);

    const f = document.createElement("span");
    f.className = "rpn-rotulo-f";
    f.textContent = tecla.rotuloF;
    const principal = document.createElement("span");
    principal.className = "rpn-rotulo";
    principal.textContent = tecla.rotulo;
    const g = document.createElement("span");
    g.className = "rpn-rotulo-g";
    g.textContent = tecla.rotuloG;
    botao.append(f, principal, g);

    let nome = tecla === R.Tecla.ON ? "ON, ajustes" : tecla.rotulo;
    if (tecla.rotuloF) nome += `, f: ${tecla.rotuloF}`;
    if (tecla.rotuloG) nome += `, g: ${tecla.rotuloG}`;
    botao.setAttribute("aria-label", nome);

    // O clique com o mouse não tira o foco de onde ele estava, para o teclado físico continuar funcionando.
    botao.addEventListener("mousedown", (evento) => evento.preventDefault());
    botao.addEventListener("click", () => tocar(tecla));
    botoes.set(tecla, botao);
    return botao;
  }

  // O ENTER ocupa duas linhas: entra uma vez só, e o CSS o estende.
  for (const linha of R.LINHAS_TECLADO) {
    for (const nome of linha) {
      const tecla = R.Tecla[nome];
      if (!botoes.has(tecla)) teclado.append(criarTecla(tecla));
    }
  }

  // ---------- Visor e painel ----------

  function linhaPainel(rotulo, valor) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = valor;
    div.append(dt, dd);
    return div;
  }

  function atualizar() {
    const d = motor.visor();
    if (mostrandoExecucao && !d.erro) {
      // Programas curtos terminam num instante; o visor mostra "executando" pelo tempo mínimo.
      d.texto = "executando";
      d.expoente = "";
      d.legenda = "";
      d.executando = true;
    }
    texto.textContent = d.texto;
    expoente.textContent = d.expoente;
    legenda.textContent = d.legenda;
    raiz.classList.toggle("rpn-com-erro", d.erro);
    raiz.classList.toggle("rpn-executando", d.executando);
    const ligados = {
      f: d.prefixo === "f",
      g: d.prefixo === "g",
      begin: d.begin,
      dmy: d.dmy,
      c: d.compound,
      prgm: d.programa,
    };
    for (const [nome, el] of Object.entries(indicadores)) el.classList.toggle("rpn-ligado", Boolean(ligados[nome]));
    const extra = d.prefixo && d.prefixo !== "f" && d.prefixo !== "g" ? d.prefixo : "";
    prefixoExtra.textContent = extra;
    teclado.classList.toggle("rpn-prefixo-f", d.prefixo === "f");
    teclado.classList.toggle("rpn-prefixo-g", d.prefixo === "g");

    // Leitura para leitores de tela: o número com o expoente e a legenda, sem os indicadores.
    leitura.textContent = [
      d.texto,
      d.expoente.trim() ? `vezes dez elevado a ${d.expoente.trim()}` : "",
      d.legenda,
      extra ? `prefixo ${extra}` : d.prefixo ? `prefixo ${d.prefixo}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    painel.hidden = preferencias.painel === "oculto";
    for (const b of botoesPainel) {
      const ativo = b.dataset.painel === preferencias.painel;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    const linhas = preferencias.painel === "tvm" ? d.registros : d.pilha;
    linhasPainel.replaceChildren(...linhas.map(([r, v]) => linhaPainel(r, v)));
  }

  // ---------- Execução ----------

  let tempoMensagem = 0;
  let execucao = 0;
  let mostrandoExecucao = false;

  function agendarLimpezaDaMensagem() {
    clearTimeout(tempoMensagem);
    if (!motor.temMensagemTemporaria) return;
    tempoMensagem = setTimeout(() => {
      motor.limparMensagem();
      atualizar();
    }, MENSAGEM_MS);
  }

  const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

  async function rodarPrograma() {
    const minha = ++execucao;
    const inicio = Date.now();
    let passos = 0;
    mostrandoExecucao = true;
    atualizar();
    while (motor.executando && minha === execucao) {
      if (motor.passo() === "pausa") {
        // PSE: mostra o valor por um segundo e continua.
        mostrandoExecucao = false;
        atualizar();
        await esperar(PAUSA_MS);
        if (minha !== execucao) return;
        mostrandoExecucao = true;
      }
      if (++passos % 50 === 0) {
        atualizar();
        await esperar(0);
      }
    }
    if (minha !== execucao) return;
    // Deixa o aviso "executando" visível por um instante, mesmo em programas curtos.
    const decorrido = Date.now() - inicio;
    if (decorrido < EXECUCAO_MINIMA_MS) await esperar(EXECUCAO_MINIMA_MS - decorrido);
    if (minha !== execucao) return;
    mostrandoExecucao = false;
    atualizar();
    salvar();
  }

  function vibrar() {
    if (!preferencias.vibrar) return;
    try {
      navigator.vibrate?.(10);
    } catch {
      // aparelho sem vibração
    }
  }

  function destacar(tecla) {
    const botao = botoes.get(tecla);
    if (!botao) return;
    botao.classList.add("rpn-pressionada");
    setTimeout(() => botao.classList.remove("rpn-pressionada"), 120);
  }

  function tocar(tecla) {
    vibrar();
    if (motor.executando || mostrandoExecucao) {
      // Qualquer tecla interrompe o programa em execução.
      execucao++;
      mostrandoExecucao = false;
      if (motor.executando) motor.parar();
      atualizar();
      salvar();
      return;
    }
    if (tecla === R.Tecla.ON) {
      motor.limparPrefixo();
      atualizar();
      abrirAjustes();
      return;
    }
    motor.pressionar(tecla);
    if (motor.executando) rodarPrograma();
    agendarLimpezaDaMensagem();
    atualizar();
    salvar();
  }

  // ---------- Teclado físico ----------

  const ATALHOS = {
    Enter: [R.Tecla.ENTER],
    "+": [R.Tecla.ADD],
    "-": [R.Tecla.SUB],
    "*": [R.Tecla.MUL],
    "/": [R.Tecla.DIV],
    ",": [R.Tecla.DOT],
    ".": [R.Tecla.DOT],
    Backspace: [R.Tecla.G, R.Tecla.DIV],
    Delete: [R.Tecla.CLX],
    Escape: [R.Tecla.CLX],
    f: [R.Tecla.F],
    F: [R.Tecla.F],
    g: [R.Tecla.G],
    G: [R.Tecla.G],
  };

  document.addEventListener("keydown", (evento) => {
    if (evento.defaultPrevented || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (dialogo.open || dialogo.hasAttribute("open")) return;
    const alvo = evento.target;
    if (alvo && alvo.closest && alvo.closest("input, select, textarea, [contenteditable]")) return;
    // Enter e espaço num botão focado acionam o próprio botão.
    if ((evento.key === "Enter" || evento.key === " ") && alvo && alvo.closest && alvo.closest("button, a")) return;
    let sequencia = ATALHOS[evento.key];
    if (!sequencia && /^[0-9]$/.test(evento.key)) sequencia = [R.teclaDoDigito(Number(evento.key))];
    if (!sequencia) return;
    // Esc com um prefixo pendente só cancela o prefixo.
    if (evento.key === "Escape" && motor.temPrefixo) {
      evento.preventDefault();
      motor.limparPrefixo();
      atualizar();
      return;
    }
    evento.preventDefault();
    for (const tecla of sequencia) {
      destacar(tecla);
      tocar(tecla);
    }
  });

  // ---------- Painel ----------

  function escolherPainel(valor) {
    preferencias.painel = valor;
    salvarPreferencias();
    for (const b of botoesPainelAjuste) {
      const ativo = b.dataset.painelAjuste === valor;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    atualizar();
  }

  for (const b of botoesPainel) b.addEventListener("click", () => escolherPainel(b.dataset.painel));

  // ---------- Ajustes (tecla ON) ----------

  function mostrarConfirmacao(sim) {
    ajustesPrincipal.hidden = sim;
    ajustesConfirmar.hidden = !sim;
    (sim ? dialogo.querySelector("#rpn-cancelar-apagar") : dialogo.querySelector("#rpn-apagar")).focus();
  }

  function abrirAjustes() {
    campoVirgula.checked = motor.virgula;
    campoVibrar.checked = preferencias.vibrar;
    for (const b of botoesPainelAjuste) {
      const ativo = b.dataset.painelAjuste === preferencias.painel;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    ajustesPrincipal.hidden = false;
    ajustesConfirmar.hidden = true;
    if (typeof dialogo.showModal === "function") dialogo.showModal();
    else dialogo.setAttribute("open", "");
    campoVirgula.focus();
  }

  function fecharAjustes() {
    if (typeof dialogo.close === "function" && dialogo.open) dialogo.close();
    else dialogo.removeAttribute("open");
    botoes.get(R.Tecla.ON)?.focus();
  }

  campoVirgula.addEventListener("change", () => {
    motor.virgula = campoVirgula.checked;
    atualizar();
    salvar();
  });
  campoVibrar.addEventListener("change", () => {
    preferencias.vibrar = campoVibrar.checked;
    salvarPreferencias();
  });
  for (const b of botoesPainelAjuste) b.addEventListener("click", () => escolherPainel(b.dataset.painelAjuste));
  dialogo.querySelector("#rpn-guia").addEventListener("click", () => fecharAjustes());
  dialogo.querySelector("#rpn-fechar").addEventListener("click", fecharAjustes);
  dialogo.querySelector("#rpn-pedir-apagar").addEventListener("click", () => mostrarConfirmacao(true));
  dialogo.querySelector("#rpn-cancelar-apagar").addEventListener("click", () => mostrarConfirmacao(false));
  dialogo.querySelector("#rpn-apagar").addEventListener("click", () => {
    execucao++;
    motor.apagarTudo();
    atualizar();
    salvar();
    fecharAjustes();
  });
  // Esc fecha o diálogo (o navegador já faz isso no showModal; aqui cobre o modo sem suporte).
  dialogo.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      evento.preventDefault();
      fecharAjustes();
    }
  });
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) fecharAjustes(); // clique fora da caixa
  });

  atualizar();
})();
