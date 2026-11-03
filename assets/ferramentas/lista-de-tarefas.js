"use strict";
/*
 * Interface da Lista de Tarefas: lista por dia (ui/telas/lista/TelaListaTarefas.kt e CartaoTarefa.kt)
 * e formulário de nova tarefa/edição (ui/telas/formulario/TelaFormularioTarefa.kt e SeletorData.kt)
 * do app Android, com as regras de lista-de-tarefas-logica.js. As tarefas ficam no localStorage e
 * acompanham as mudanças feitas em outras abas.
 */
(() => {
  const raiz = document.querySelector(".lista-tarefas");
  if (!raiz || typeof LogicaListaTarefas === "undefined") return;
  const L = LogicaListaTarefas;

  const CHAVE_TAREFAS = "efs-lista-de-tarefas-tarefas";
  const CHAVE_FILTRO = "efs-lista-de-tarefas-filtro";
  const DURACAO_AVISO_MS = 8000;
  const SUBTAREFAS_VISIVEIS = 3;
  const VAZIO = {
    todas: ["Nenhuma tarefa ainda.", "Adicione uma nova tarefa!"],
    pendentes: ["Nenhuma tarefa pendente.", "Tudo em dia!"],
    concluidas: ["Nenhuma tarefa concluída ainda.", ""],
  };

  const $ = (seletor) => raiz.querySelector(seletor);
  const vistaLista = $("#lt-vista-lista");
  const secoes = $("#lt-secoes");
  const vazio = $("#lt-vazio");
  const botoesFiltro = raiz.querySelectorAll("[data-filtro]");
  const botaoNova = $("#lt-nova");
  const form = $("#lt-form");
  const tituloForm = $("#lt-form-titulo");
  const campoTitulo = $("#lt-titulo");
  const erroTitulo = $("#lt-titulo-erro");
  const campoDescricao = $("#lt-descricao");
  const campoData = $("#lt-data");
  const detalheData = $("#lt-data-detalhe");
  const atalhos = raiz.querySelectorAll("[data-atalho]");
  const tituloSubtarefas = $("#lt-sub-titulo");
  const listaSubtarefas = $("#lt-sub-lista");
  const campoSubtarefa = $("#lt-sub-nova");
  const botaoSubtarefa = $("#lt-sub-adicionar");
  const botaoSalvar = $("#lt-salvar");
  const aviso = $("#lt-aviso");
  const avisoTexto = $("#lt-aviso-texto");
  const botaoDesfazer = $("#lt-desfazer");
  const status = $("#lt-status");
  const dialogoDescartar = $("#lt-dialogo-descartar");

  let tarefas = [];
  let filtro = "todas";
  let hoje = L.hoje();
  /** Tarefas com todas as subtarefas à mostra ("+N mais"), só nesta visita, como no app. */
  const expandidas = new Set();
  let desfazer = null;
  let temporizadorAviso = 0;

  /** Formulário aberto: null quando a lista está à mostra. */
  let edicao = null;

  // ---------- Armazenamento ----------

  function carregar() {
    try {
      tarefas = L.lerTarefas(localStorage.getItem(CHAVE_TAREFAS));
      const salvo = localStorage.getItem(CHAVE_FILTRO);
      if (L.FILTROS.some((f) => f.id === salvo)) filtro = salvo;
    } catch (erro) {
      tarefas = [];
      $("#lt-sem-armazenamento").hidden = false;
    }
  }

  function gravar() {
    try {
      localStorage.setItem(CHAVE_TAREFAS, JSON.stringify(tarefas));
    } catch (erro) {
      $("#lt-sem-armazenamento").hidden = false;
    }
  }

  function alterar(novas) {
    tarefas = novas;
    gravar();
    desenhar();
  }

  // ---------- Lista ----------

  const ICONES = {
    excluir: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    remover: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const svg = (nome) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function caixa(acao, id, marcada, rotulo, sub) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = marcada;
    input.dataset.acao = acao;
    input.dataset.id = String(id);
    if (sub !== undefined) input.dataset.sub = sub;
    if (rotulo) input.setAttribute("aria-label", rotulo);
    return input;
  }

  function blocoSubtarefas(tarefa) {
    const total = tarefa.subtarefas.length;
    const feitas = L.subtarefasConcluidas(tarefa);
    const expandida = expandidas.has(tarefa.id);
    const bloco = elemento("div", "lt-subs");

    const topo = elemento("div", "lt-subs-topo");
    const contagem = elemento("span", "lt-subs-contagem", `${feitas}/${total}`);
    contagem.classList.toggle("completa", feitas === total);
    topo.append(elemento("span", "", "Subtarefas"), contagem);

    const barra = elemento("div", "lt-subs-barra");
    barra.setAttribute("role", "progressbar");
    barra.setAttribute("aria-label", `Subtarefas de ${tarefa.titulo}`);
    barra.setAttribute("aria-valuemin", "0");
    barra.setAttribute("aria-valuemax", String(total));
    barra.setAttribute("aria-valuenow", String(feitas));
    barra.setAttribute("aria-valuetext", `${feitas} de ${total} concluídas`);
    const preenchimento = elemento("span");
    preenchimento.style.width = `${(feitas / total) * 100}%`;
    barra.append(preenchimento);

    const lista = elemento("ul", "lt-subs-lista");
    const visiveis = expandida ? tarefa.subtarefas : tarefa.subtarefas.slice(0, SUBTAREFAS_VISIVEIS);
    for (const subtarefa of visiveis) {
      const li = document.createElement("li");
      const label = elemento("label", "lt-sub");
      label.classList.toggle("riscada", subtarefa.concluida || tarefa.concluida);
      label.append(caixa("subtarefa", tarefa.id, subtarefa.concluida, null, subtarefa.id), elemento("span", "", subtarefa.titulo));
      li.append(label);
      lista.append(li);
    }
    bloco.append(topo, barra, lista);

    if (total > SUBTAREFAS_VISIVEIS) {
      const mais = elemento("button", "lt-mais", expandida ? "Mostrar menos" : `+${total - SUBTAREFAS_VISIVEIS} mais`);
      mais.type = "button";
      mais.dataset.acao = "expandir";
      mais.dataset.id = String(tarefa.id);
      mais.setAttribute("aria-expanded", String(expandida));
      bloco.append(mais);
    }
    return bloco;
  }

  function cartao(tarefa) {
    const atrasada = L.atrasada(tarefa, hoje);
    const li = elemento("li", "lt-tarefa");
    li.classList.toggle("concluida", tarefa.concluida);
    li.classList.toggle("atrasada", atrasada);
    li.dataset.id = String(tarefa.id);

    const marca = elemento("label", "lt-marca");
    marca.append(caixa("concluir", tarefa.id, tarefa.concluida, `Concluída: ${tarefa.titulo}`));

    const corpo = elemento("div", "lt-corpo");
    // Título e descrição abrem a edição, como o toque no cartão do app
    const abrir = elemento("button", "lt-abrir");
    abrir.type = "button";
    abrir.dataset.acao = "editar";
    abrir.dataset.id = String(tarefa.id);
    abrir.append(elemento("span", "lt-titulo", tarefa.titulo));
    if (tarefa.descricao) abrir.append(elemento("span", "lt-descricao", tarefa.descricao));
    abrir.append(elemento("span", "sr-only", " (editar tarefa)"));
    corpo.append(abrir);

    if (atrasada) {
      const selo = elemento("p", "lt-selo");
      selo.innerHTML = svg("relogio");
      selo.append("Atrasada");
      corpo.append(selo);
    }
    if (tarefa.subtarefas.length > 0) corpo.append(blocoSubtarefas(tarefa));

    const excluir = elemento("button", "lt-icone");
    excluir.type = "button";
    excluir.dataset.acao = "excluir";
    excluir.dataset.id = String(tarefa.id);
    excluir.setAttribute("aria-label", `Excluir tarefa ${tarefa.titulo}`);
    excluir.title = "Excluir tarefa";
    excluir.innerHTML = svg("excluir");

    li.append(marca, corpo, excluir);
    return li;
  }

  function secao({ dia, tarefas: doDia }) {
    const el = elemento("section", "lt-secao");
    const id = `lt-secao-${dia}`;
    el.setAttribute("aria-labelledby", id);
    const cabecalho = elemento("div", "lt-secao-cabecalho");
    const titulo = elemento("h2", "lt-secao-titulo", L.tituloSecao(dia, hoje));
    titulo.id = id;
    titulo.classList.toggle("atrasada", dia < hoje && doDia.some((t) => !t.concluida));
    cabecalho.append(titulo, elemento("span", "lt-secao-contagem", doDia.length === 1 ? "1 tarefa" : `${doDia.length} tarefas`));
    const lista = elemento("ul", "lt-tarefas");
    lista.append(...doDia.map(cartao));
    el.append(cabecalho, lista);
    return el;
  }

  function desenharResumo() {
    const r = L.resumo(tarefas, hoje);
    $("#lt-para-hoje").textContent = String(r.paraHoje);
    $("#lt-atrasadas").textContent = String(r.atrasadas);
    $("#lt-atrasadas-rotulo").textContent = r.atrasadas === 1 ? "atrasada" : "atrasadas";
    $("#lt-pendentes").textContent = String(r.pendentes);
    $("#lt-pendentes-rotulo").textContent = r.pendentes === 1 ? "pendente" : "pendentes";
    $("#lt-indicador-atrasadas").classList.toggle("ativo", r.atrasadas > 0);
    for (const f of L.FILTROS) raiz.querySelector(`[data-contagem="${f.id}"]`).textContent = String(L.contar(tarefas, f.id));
  }

  /** Redesenha a lista e devolve o foco ao mesmo controle (ou ao do cartão vizinho, se ele sumiu). */
  function desenhar() {
    const ativo = document.activeElement;
    const foco =
      ativo && secoes.contains(ativo) && ativo.dataset.id
        ? {
            id: ativo.dataset.id,
            acao: ativo.dataset.acao,
            sub: ativo.dataset.sub,
            indice: [...secoes.querySelectorAll(".lt-tarefa")].indexOf(ativo.closest(".lt-tarefa")),
          }
        : null;

    const visiveis = L.agrupar(L.filtrar(tarefas, filtro));
    secoes.replaceChildren(...visiveis.map(secao));
    vazio.hidden = visiveis.length > 0;
    const [titulo, texto] = VAZIO[filtro];
    $("#lt-vazio-titulo").textContent = titulo;
    $("#lt-vazio-texto").textContent = texto;
    $("#lt-vazio-texto").hidden = texto === "";
    $("#lt-vazio-nova").hidden = filtro !== "todas";
    desenharResumo();

    if (!foco) return;
    const sub = foco.sub !== undefined ? `[data-sub="${CSS.escape(foco.sub)}"]` : "";
    let alvo = secoes.querySelector(`[data-id="${foco.id}"][data-acao="${foco.acao}"]${sub}`);
    if (!alvo) {
      const cartoes = secoes.querySelectorAll(".lt-tarefa");
      alvo = cartoes[Math.min(foco.indice, cartoes.length - 1)]?.querySelector('[data-acao="concluir"]') ?? null;
    }
    (alvo ?? botaoNova).focus({ preventScroll: Boolean(alvo) });
  }

  function escolherFiltro(novo) {
    filtro = novo;
    for (const botao of botoesFiltro) {
      const ativo = botao.dataset.filtro === novo;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    try {
      localStorage.setItem(CHAVE_FILTRO, novo);
    } catch (erro) {
      /* Sem armazenamento, o filtro vale só nesta visita. */
    }
    desenhar();
  }

  for (const botao of botoesFiltro) botao.addEventListener("click", () => escolherFiltro(botao.dataset.filtro));

  secoes.addEventListener("change", (evento) => {
    const input = evento.target.closest("input[data-acao]");
    if (!input) return;
    const id = Number(input.dataset.id);
    if (input.dataset.acao === "concluir") {
      alterar(L.alternarConcluida(tarefas, id));
      const tarefa = tarefas.find((t) => t.id === id);
      if (tarefa) status.textContent = tarefa.concluida ? "Tarefa concluída." : "Tarefa pendente.";
    } else if (input.dataset.acao === "subtarefa") {
      alterar(L.alternarSubtarefa(tarefas, id, input.dataset.sub));
    }
  });

  secoes.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    const id = Number(botao.dataset.id);
    const tarefa = tarefas.find((t) => t.id === id);
    if (!tarefa) return;
    if (botao.dataset.acao === "editar") abrirFormulario(tarefa);
    else if (botao.dataset.acao === "expandir") {
      if (expandidas.has(id)) expandidas.delete(id);
      else expandidas.add(id);
      desenhar();
    } else if (botao.dataset.acao === "excluir") {
      alterar(L.remover(tarefas, id));
      avisar("Tarefa excluída", () => {
        alterar(L.salvar(tarefas, tarefa));
        return secoes.querySelector(`[data-acao="concluir"][data-id="${id}"]`);
      });
    }
  });

  // ---------- Aviso com "Desfazer" ----------

  function avisar(texto, acaoDesfazer) {
    clearTimeout(temporizadorAviso);
    desfazer = acaoDesfazer;
    avisoTexto.textContent = texto;
    aviso.classList.add("visivel");
    status.textContent = `${texto}. Para desfazer, use o botão Desfazer.`;
    temporizadorAviso = setTimeout(esconderAviso, DURACAO_AVISO_MS);
  }

  function esconderAviso() {
    clearTimeout(temporizadorAviso);
    aviso.classList.remove("visivel");
    desfazer = null;
  }

  botaoDesfazer.addEventListener("click", () => {
    const acao = desfazer;
    esconderAviso();
    if (!acao) return;
    // O foco vai para a tarefa que voltou, já que o botão do aviso some
    const alvo = acao();
    (alvo ?? (edicao ? campoTitulo : botaoNova)).focus();
    status.textContent = alvo ? "Tarefa restaurada." : "Tarefa restaurada, mas fora do filtro atual.";
  });

  // ---------- Formulário ----------

  const novoIdSubtarefa = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  function camposAtuais() {
    return {
      original: edicao.original,
      titulo: campoTitulo.value,
      descricao: campoDescricao.value,
      dia: edicao.dia,
      subtarefas: edicao.subtarefas,
      novaSubtarefa: campoSubtarefa.value,
    };
  }

  const alterado = () => edicao !== null && L.alterado(camposAtuais());

  function abrirFormulario(tarefa = null) {
    edicao = {
      id: tarefa ? tarefa.id : null,
      original: tarefa,
      dia: tarefa ? tarefa.dia : hoje,
      subtarefas: tarefa ? tarefa.subtarefas : [],
      tentouSalvar: false,
    };
    tituloForm.textContent = tarefa ? "Editar tarefa" : "Nova tarefa";
    botaoSalvar.textContent = tarefa ? "Atualizar" : "Salvar";
    campoTitulo.value = tarefa ? tarefa.titulo : "";
    campoDescricao.value = tarefa ? tarefa.descricao : "";
    campoSubtarefa.value = "";
    mostrarErroTitulo();
    desenharData();
    desenharSubtarefas();
    vistaLista.hidden = true;
    form.hidden = false;
    if (raiz.getBoundingClientRect().top < 0) raiz.scrollIntoView({ block: "start" });
    campoTitulo.focus();
    const fim = campoTitulo.value.length;
    campoTitulo.setSelectionRange(fim, fim);
  }

  function fecharFormulario() {
    const id = edicao?.id ?? null;
    edicao = null;
    form.hidden = true;
    vistaLista.hidden = false;
    desenhar();
    const alvo = id !== null ? secoes.querySelector(`[data-acao="editar"][data-id="${id}"]`) : null;
    (alvo ?? botaoNova).focus();
  }

  /** Cancelar, Esc ou "voltar": pergunta antes de perder o que foi digitado. */
  function sair() {
    if (!alterado()) {
      fecharFormulario();
      return;
    }
    if (typeof dialogoDescartar.showModal === "function") dialogoDescartar.showModal();
    else dialogoDescartar.setAttribute("open", "");
    $("#lt-continuar").focus();
  }

  function fecharDialogo() {
    if (typeof dialogoDescartar.close === "function") dialogoDescartar.close();
    else dialogoDescartar.removeAttribute("open");
  }

  function mostrarErroTitulo() {
    const invalido = edicao !== null && edicao.tentouSalvar && campoTitulo.value.trim() === "";
    erroTitulo.textContent = invalido ? "Digite um título para a tarefa" : "";
    campoTitulo.setAttribute("aria-invalid", String(invalido));
  }

  /** Sem atualizarCampo, só o texto de apoio e os atalhos mudam (a pessoa ainda está digitando). */
  function desenharData(atualizarCampo = true) {
    if (atualizarCampo) campoData.value = L.paraTextoData(edicao.dia);
    const relativo = L.rotuloRelativo(edicao.dia, hoje);
    detalheData.textContent = [relativo, L.nomeDiaDaSemana(edicao.dia)].filter(Boolean).join(" · ");
    detalheData.classList.toggle("passado", edicao.dia < hoje);
    for (const botao of atalhos) {
      const ativo = edicao.dia === hoje + Number(botao.dataset.atalho);
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  function desenharSubtarefas() {
    const ativo = document.activeElement;
    const foco = ativo && listaSubtarefas.contains(ativo) ? { sub: ativo.dataset.sub, acao: ativo.dataset.acao } : null;
    tituloSubtarefas.textContent = `Subtarefas (${edicao.subtarefas.length})`;
    listaSubtarefas.replaceChildren(
      ...edicao.subtarefas.map((subtarefa) => {
        const li = document.createElement("li");
        const label = elemento("label", "lt-sub");
        label.classList.toggle("riscada", subtarefa.concluida);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = subtarefa.concluida;
        input.dataset.acao = "alternar";
        input.dataset.sub = subtarefa.id;
        label.append(input, elemento("span", "", subtarefa.titulo));
        const remover = elemento("button", "lt-icone");
        remover.type = "button";
        remover.dataset.acao = "remover";
        remover.dataset.sub = subtarefa.id;
        remover.setAttribute("aria-label", `Remover subtarefa ${subtarefa.titulo}`);
        remover.title = "Remover subtarefa";
        remover.innerHTML = svg("remover");
        li.append(label, remover);
        return li;
      }),
    );
    listaSubtarefas.hidden = edicao.subtarefas.length === 0;
    botaoSubtarefa.disabled = campoSubtarefa.value.trim() === "";
    if (foco?.acao === "alternar") listaSubtarefas.querySelector(`[data-acao="alternar"][data-sub="${CSS.escape(foco.sub)}"]`)?.focus();
  }

  function adicionarSubtarefa() {
    const texto = campoSubtarefa.value.trim();
    if (texto === "") return;
    edicao.subtarefas = [...edicao.subtarefas, { id: novoIdSubtarefa(), titulo: texto, concluida: false }];
    campoSubtarefa.value = "";
    desenharSubtarefas();
    // O campo continua pronto para a próxima subtarefa
    campoSubtarefa.focus();
    status.textContent = `Subtarefa “${texto}” adicionada.`;
  }

  campoTitulo.addEventListener("input", mostrarErroTitulo);

  campoData.addEventListener("input", () => {
    const dia = L.deTextoData(campoData.value);
    if (dia === null) return;
    edicao.dia = dia;
    desenharData(false);
  });
  // Campo apagado ou incompleto volta para a data escolhida: toda tarefa tem um dia
  campoData.addEventListener("blur", () => {
    if (edicao && L.deTextoData(campoData.value) !== edicao.dia) desenharData();
  });

  for (const botao of atalhos) {
    botao.addEventListener("click", () => {
      edicao.dia = hoje + Number(botao.dataset.atalho);
      desenharData();
    });
  }

  campoSubtarefa.addEventListener("input", () => {
    botaoSubtarefa.disabled = campoSubtarefa.value.trim() === "";
  });
  campoSubtarefa.addEventListener("keydown", (evento) => {
    // Enter adiciona a subtarefa em vez de salvar a tarefa inteira
    if (evento.key === "Enter" && !evento.isComposing) {
      evento.preventDefault();
      adicionarSubtarefa();
    }
  });
  botaoSubtarefa.addEventListener("click", adicionarSubtarefa);

  listaSubtarefas.addEventListener("change", (evento) => {
    const input = evento.target.closest('[data-acao="alternar"]');
    if (!input) return;
    edicao.subtarefas = L.alternar(edicao.subtarefas, input.dataset.sub);
    desenharSubtarefas();
  });

  listaSubtarefas.addEventListener("click", (evento) => {
    const botao = evento.target.closest('button[data-acao="remover"]');
    if (!botao) return;
    const indice = edicao.subtarefas.findIndex((s) => s.id === botao.dataset.sub);
    const removida = edicao.subtarefas[indice];
    edicao.subtarefas = edicao.subtarefas.filter((s) => s.id !== botao.dataset.sub);
    desenharSubtarefas();
    const botoes = listaSubtarefas.querySelectorAll('[data-acao="remover"]');
    (botoes[Math.min(indice, botoes.length - 1)] ?? campoSubtarefa).focus();
    if (removida) status.textContent = `Subtarefa “${removida.titulo}” removida.`;
  });

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    edicao.tentouSalvar = true;
    mostrarErroTitulo();
    if (campoTitulo.value.trim() === "") {
      campoTitulo.focus();
      return;
    }
    // Se a tarefa foi excluída em outra aba enquanto era editada, ela volta com as alterações
    const base = edicao.id !== null ? (tarefas.find((t) => t.id === edicao.id) ?? edicao.original) : null;
    const agora = Date.now();
    const tarefa = L.montarTarefa({
      base,
      idNovo: L.novoId(tarefas, agora),
      titulo: campoTitulo.value,
      descricao: campoDescricao.value,
      dia: edicao.dia,
      subtarefas: edicao.subtarefas,
      subtarefaPendente: campoSubtarefa.value,
      agoraMs: agora,
      novoIdSubtarefa,
    });
    if (!tarefa) return;
    tarefas = L.salvar(tarefas, tarefa);
    gravar();
    edicao.id = tarefa.id;
    fecharFormulario();
    const visivel = L.filtrar([tarefa], filtro).length > 0;
    status.textContent = `${base ? "Tarefa atualizada" : "Tarefa criada"}${visivel ? "" : ", fora do filtro atual"}.`;
  });

  $("#lt-cancelar").addEventListener("click", sair);
  form.addEventListener("keydown", (evento) => {
    // Na data, o Esc fecha o calendário do navegador
    if (evento.key === "Escape" && !evento.defaultPrevented && evento.target !== campoData) {
      evento.preventDefault();
      sair();
    }
  });

  $("#lt-continuar").addEventListener("click", () => {
    fecharDialogo();
    campoTitulo.focus();
  });
  $("#lt-descartar").addEventListener("click", () => {
    fecharDialogo();
    fecharFormulario();
  });

  window.addEventListener("beforeunload", (evento) => {
    if (alterado()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  botaoNova.addEventListener("click", () => abrirFormulario());
  $("#lt-vazio-nova").addEventListener("click", () => abrirFormulario());

  // ---------- Outras abas e virada do dia ----------

  window.addEventListener("storage", (evento) => {
    if (evento.key !== CHAVE_TAREFAS) return;
    tarefas = L.lerTarefas(evento.newValue);
    desenhar();
  });

  // A data de hoje muda se a página ficou aberta de um dia para o outro
  function conferirHoje() {
    const agora = L.hoje();
    if (agora === hoje) return;
    hoje = agora;
    desenhar();
    if (edicao) desenharData();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") conferirHoje();
  });
  setInterval(conferirHoje, 60000);

  carregar();
  escolherFiltro(filtro);
})();
