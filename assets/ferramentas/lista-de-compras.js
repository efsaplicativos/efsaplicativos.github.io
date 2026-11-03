"use strict";
/*
 * Interface da Lista de Compras: catálogo de itens (ui/telas/TelaItens.kt) e lista da compra
 * (ui/telas/TelaCompras.kt) do app Android, com as regras de lista-de-compras-logica.js.
 * Os itens ficam no localStorage e acompanham as mudanças feitas em outras abas.
 */
(() => {
  const raiz = document.querySelector(".lista-compras");
  if (!raiz || typeof LogicaListaCompras === "undefined") return;
  const L = LogicaListaCompras;

  const CHAVE_ITENS = "efs-lista-de-compras-itens";
  const CHAVE_ABA = "efs-lista-de-compras-aba";
  const DURACAO_AVISO_MS = 8000;
  const ERROS = {
    vazio: "Digite o nome do item.",
    duplicado: "Já existe um item com esse nome.",
  };

  const $ = (seletor) => raiz.querySelector(seletor);
  const botoesAba = raiz.querySelectorAll("[data-aba]");
  const paineis = raiz.querySelectorAll("[data-painel]");
  const form = $("#lc-form");
  const campoNome = $("#lc-nome");
  const rotuloNome = $("#lc-rotulo");
  const botaoSalvar = $("#lc-salvar");
  const botaoCancelar = $("#lc-cancelar");
  const textoErro = $("#lc-erro");
  const resumoItens = $("#lc-resumo-itens");
  const listaItens = $("#lc-itens");
  const vazioItens = $("#lc-itens-vazio");
  const listaCompras = $("#lc-compras");
  const vazioCompras = $("#lc-compras-vazio");
  const rodape = $("#lc-rodape");
  const progresso = $("#lc-progresso");
  const barra = $("#lc-barra");
  const contagemCarrinho = $("#lc-contagem-carrinho");
  const totalCarrinho = $("#lc-total-carrinho");
  const totalEstimado = $("#lc-total-estimado");
  const contagemItens = $("#lc-contagem-itens");
  const contagemCompras = $("#lc-contagem-compras");
  const aviso = $("#lc-aviso");
  const avisoTexto = $("#lc-aviso-texto");
  const botaoDesfazer = $("#lc-desfazer");
  const status = $("#lc-status");
  const dialogoFinalizar = $("#lc-dialogo-finalizar");
  const dialogoFinalizada = $("#lc-dialogo-finalizada");
  const linhaManter = $("#lc-manter-linha");
  const caixaManter = $("#lc-manter");

  let itens = [];
  let aba = "itens";
  let editandoId = null;
  /** O que está escrito nos campos de quantidade e preço ("1," enquanto a pessoa digita "1,5"). */
  const rascunhos = new Map();
  let desfazer = null;
  let temporizadorAviso = 0;

  // ---------- Armazenamento ----------

  function carregar() {
    try {
      itens = L.lerItens(localStorage.getItem(CHAVE_ITENS));
      const salva = localStorage.getItem(CHAVE_ABA);
      if (salva === "itens" || salva === "compras") aba = salva;
    } catch (erro) {
      itens = [];
      $("#lc-sem-armazenamento").hidden = false;
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE_ITENS, JSON.stringify(itens));
    } catch (erro) {
      $("#lc-sem-armazenamento").hidden = false;
    }
  }

  function alterar(novos) {
    if (novos === itens) return;
    itens = novos;
    salvar();
    desenhar();
  }

  // ---------- Desenho ----------

  const ICONES = {
    editar: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
    excluir: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    tirar: '<path d="M3 4h2l2.4 11h10.2L20 8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M11 10.5h5"/>',
  };

  function botaoIcone(acao, id, rotulo) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "lc-icone";
    botao.dataset.acao = acao;
    botao.dataset.id = String(id);
    botao.setAttribute("aria-label", rotulo);
    botao.title = rotulo;
    botao.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[acao]}</svg>`;
    return botao;
  }

  function marca(acao, item, marcado, rotulo) {
    const label = document.createElement("label");
    label.className = "lc-marca";
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = marcado;
    caixa.dataset.acao = acao;
    caixa.dataset.id = String(item.id);
    caixa.setAttribute("aria-label", rotulo);
    const nome = document.createElement("span");
    nome.className = "lc-nome";
    nome.textContent = item.nome;
    label.append(caixa, nome);
    return label;
  }

  function linhaItem(item) {
    const li = document.createElement("li");
    li.className = "lc-item";
    li.classList.toggle("na-lista", item.naLista);
    li.classList.toggle("editando", item.id === editandoId);
    li.dataset.id = String(item.id);
    li.append(
      marca("lista", item, item.naLista, `${item.nome} na lista de compras`),
      botaoIcone("editar", item.id, `Editar ${item.nome}`),
      botaoIcone("excluir", item.id, `Excluir ${item.nome}`),
    );
    return li;
  }

  function campoNumero(item, campo, rotulo, exemplo, prefixo) {
    const div = document.createElement("div");
    div.className = `lc-campo lc-campo-${campo === "quantidade" ? "qtd" : "preco"}`;
    const id = `lc-${campo}-${item.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = rotulo;
    const input = document.createElement("input");
    input.className = "input";
    input.id = id;
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = exemplo;
    input.maxLength = L.TAMANHO_MAXIMO;
    input.dataset.campo = campo;
    input.dataset.id = String(item.id);
    const chave = `${item.id}:${campo}`;
    const valor = item[campo];
    input.value = rascunhos.has(chave)
      ? rascunhos.get(chave)
      : valor == null
        ? ""
        : campo === "quantidade"
          ? L.formatarQuantidade(valor)
          : L.formatarPreco(valor);
    marcarInvalido(input);
    if (!prefixo) {
      div.append(label, input);
      return div;
    }
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = " (R$)";
    label.append(sr);
    const linha = document.createElement("div");
    linha.className = "lc-prefixo";
    const simbolo = document.createElement("span");
    simbolo.setAttribute("aria-hidden", "true");
    simbolo.textContent = prefixo;
    linha.append(simbolo, input);
    div.append(label, linha);
    return div;
  }

  function cartaoCompra(item) {
    const li = document.createElement("li");
    li.className = "lc-compra";
    li.classList.toggle("comprado", item.comprado);
    li.dataset.id = String(item.id);

    const topo = document.createElement("div");
    topo.className = "lc-compra-topo";
    topo.append(
      marca("comprado", item, item.comprado, `${item.nome} no carrinho`),
      botaoIcone("tirar", item.id, `Tirar ${item.nome} da lista`),
    );

    const campos = document.createElement("div");
    campos.className = "lc-campos";
    campos.append(
      campoNumero(item, "quantidade", "Qtd", "1"),
      campoNumero(item, "precoUnitario", "Preço unitário", "0,00", "R$"),
    );

    const linhaSubtotal = document.createElement("div");
    linhaSubtotal.className = "lc-subtotal";
    const rotulo = document.createElement("span");
    rotulo.textContent = "Subtotal";
    const valor = document.createElement("strong");
    valor.dataset.subtotal = String(item.id);
    valor.textContent = L.formatarMoeda(L.subtotal(item));
    linhaSubtotal.append(rotulo, valor);

    li.append(topo, campos, linhaSubtotal);
    return li;
  }

  /** Totais, progresso e contadores: atualizados também enquanto a pessoa digita um preço. */
  function desenharTotais() {
    const r = L.resumo(itens);
    const porcentagem = Math.round(r.progresso * 100);
    barra.style.width = `${porcentagem}%`;
    progresso.setAttribute("aria-valuenow", String(porcentagem));
    contagemCarrinho.textContent = `${r.quantidadeComprados} de ${L.plural(r.quantidadeItens, "item", "itens")}`;
    totalCarrinho.textContent = L.formatarMoeda(r.totalCarrinho);
    totalEstimado.textContent = L.formatarMoeda(r.totalEstimado);
    contagemItens.textContent = String(itens.length);
    contagemCompras.textContent = String(r.quantidadeItens);
    rodape.hidden = r.quantidadeItens === 0;
    resumoItens.hidden = itens.length === 0;
    resumoItens.textContent = `${L.plural(itens.length, "item", "itens")} · ${r.quantidadeItens} na lista de compras`;
  }

  /** Redesenha as listas e devolve o foco ao mesmo controle (ou ao vizinho, se o item sumiu). */
  function desenhar() {
    const ativo = document.activeElement;
    const foco =
      ativo && raiz.contains(ativo) && ativo.dataset.id
        ? {
            id: ativo.dataset.id,
            acao: ativo.dataset.acao,
            campo: ativo.dataset.campo,
            lista: ativo.closest("ul"),
            indice: [...(ativo.closest("ul")?.children ?? [])].indexOf(ativo.closest("li")),
            selecao: ativo.dataset.campo ? [ativo.selectionStart, ativo.selectionEnd] : null,
          }
        : null;

    listaItens.replaceChildren(...itens.map(linhaItem));
    vazioItens.hidden = itens.length > 0;
    const naLista = itens.filter((item) => item.naLista);
    listaCompras.replaceChildren(...naLista.map(cartaoCompra));
    vazioCompras.hidden = naLista.length > 0;
    desenharTotais();

    if (!foco) return;
    const seletor = foco.campo ? `[data-campo="${foco.campo}"]` : `[data-acao="${foco.acao}"]`;
    let alvo = foco.lista?.querySelector(`[data-id="${foco.id}"]${seletor}`);
    if (!alvo && foco.lista) {
      const vizinho = foco.lista.children[Math.min(foco.indice, foco.lista.children.length - 1)];
      alvo = vizinho?.querySelector(seletor) ?? null;
    }
    if (!alvo) alvo = foco.lista === listaCompras ? $("#lc-escolher") : campoNome;
    if (alvo && !alvo.closest("[hidden]")) {
      alvo.focus({ preventScroll: true });
      if (foco.selecao && alvo.setSelectionRange) {
        try {
          alvo.setSelectionRange(...foco.selecao);
        } catch (erro) {
          /* Campo sem seleção de texto: só o foco basta. */
        }
      }
    }
  }

  function mostrarAba(nova, focar = false) {
    aba = nova;
    for (const botao of botoesAba) {
      const ativo = botao.dataset.aba === nova;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
    for (const painel of paineis) painel.classList.toggle("ativo", painel.dataset.painel === nova);
    try {
      localStorage.setItem(CHAVE_ABA, nova);
    } catch (erro) {
      /* Sem armazenamento, a aba escolhida vale só nesta visita. */
    }
    if (focar && nova === "itens") campoNome.focus();
  }

  // ---------- Aviso com "Desfazer" ----------

  function avisar(texto, acaoDesfazer = null) {
    clearTimeout(temporizadorAviso);
    desfazer = acaoDesfazer;
    avisoTexto.textContent = texto;
    botaoDesfazer.hidden = !acaoDesfazer;
    aviso.classList.add("visivel");
    status.textContent = acaoDesfazer ? `${texto}. Para desfazer, use o botão Desfazer.` : texto;
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
    // O foco vai para o item que voltou, já que o botão do aviso some
    const alvo = acao();
    (alvo ?? campoNome).focus();
    if (alvo) status.textContent = "Desfeito.";
  });

  // ---------- Catálogo ----------

  function mostrarErro(texto) {
    textoErro.textContent = texto;
    campoNome.setAttribute("aria-invalid", String(Boolean(texto)));
  }

  function cancelarEdicao() {
    editandoId = null;
    campoNome.value = "";
    rotuloNome.textContent = "Novo item";
    botaoSalvar.textContent = "Adicionar";
    botaoCancelar.hidden = true;
    mostrarErro("");
    desenhar();
  }

  function editar(id) {
    const item = itens.find((i) => i.id === id);
    if (!item) return;
    editandoId = id;
    campoNome.value = item.nome;
    rotuloNome.textContent = "Editar item";
    botaoSalvar.textContent = "Salvar";
    botaoCancelar.hidden = false;
    mostrarErro("");
    desenhar();
    mostrarAba("itens");
    campoNome.focus();
    campoNome.select();
  }

  function rolarAte(nome) {
    const indice = itens.findIndex((i) => i.nome === nome);
    listaItens.children[indice]?.scrollIntoView({ block: "nearest" });
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const editando = editandoId;
    const r = editando !== null ? L.renomear(itens, editando, campoNome.value) : L.adicionar(itens, campoNome.value, Date.now());
    if (r.resultado !== "ok") {
      mostrarErro(ERROS[r.resultado]);
      campoNome.focus();
      return;
    }
    const nome = L.normalizarNome(campoNome.value);
    mostrarErro("");
    if (editando !== null) {
      editandoId = null;
      campoNome.value = "";
      rotuloNome.textContent = "Novo item";
      botaoSalvar.textContent = "Adicionar";
      botaoCancelar.hidden = true;
    } else {
      // Depois de adicionar, o campo continua pronto para o próximo item
      campoNome.value = "";
    }
    alterar(r.itens);
    campoNome.focus();
    rolarAte(nome);
    status.textContent = editando !== null ? `“${nome}” renomeado.` : `“${nome}” adicionado.`;
  });

  campoNome.addEventListener("input", () => mostrarErro(""));
  campoNome.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && editandoId !== null) {
      evento.preventDefault();
      cancelarEdicao();
    }
  });
  botaoCancelar.addEventListener("click", () => {
    cancelarEdicao();
    campoNome.focus();
  });

  listaItens.addEventListener("change", (evento) => {
    const caixa = evento.target.closest('[data-acao="lista"]');
    if (caixa) alterar(L.alternarNaLista(itens, Number(caixa.dataset.id)));
  });

  listaItens.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === "editar") {
      editar(id);
      return;
    }
    if (botao.dataset.acao === "excluir") {
      if (editandoId === id) cancelarEdicao();
      const r = L.excluir(itens, id);
      if (!r.item) return;
      limparRascunhos(id);
      alterar(r.itens);
      const removido = r.item;
      avisar(`“${removido.nome}” excluído`, () => {
        // Se outro item com o mesmo nome foi criado enquanto isso, não dá para trazer este de volta
        if (L.nomeJaExiste(removido.nome, itens, removido.id)) {
          avisar(ERROS.duplicado);
          return null;
        }
        alterar(L.restaurar(itens, removido));
        return listaItens.querySelector(`[data-acao="lista"][data-id="${removido.id}"]`);
      });
    }
  });

  // ---------- Lista da compra ----------

  function limparRascunhos(id) {
    rascunhos.delete(`${id}:quantidade`);
    rascunhos.delete(`${id}:precoUnitario`);
  }

  function marcarInvalido(input) {
    const texto = input.value;
    input.setAttribute("aria-invalid", String(texto.trim() !== "" && L.analisar(texto) === null));
  }

  listaCompras.addEventListener("change", (evento) => {
    const caixa = evento.target.closest('[data-acao="comprado"]');
    if (caixa) alterar(L.alternarComprado(itens, Number(caixa.dataset.id)));
  });

  listaCompras.addEventListener("click", (evento) => {
    const botao = evento.target.closest('button[data-acao="tirar"]');
    if (!botao) return;
    const r = L.removerDaLista(itens, Number(botao.dataset.id));
    if (!r.item) return;
    alterar(r.itens);
    const removido = r.item;
    avisar(`“${removido.nome}” saiu da lista`, () => {
      alterar(L.restaurar(itens, removido));
      return listaCompras.querySelector(`[data-acao="comprado"][data-id="${removido.id}"]`);
    });
  });

  // Digitar não redesenha a lista (o campo perderia o foco): só o subtotal e os totais mudam
  listaCompras.addEventListener("input", (evento) => {
    const input = evento.target.closest("[data-campo]");
    if (!input) return;
    const id = Number(input.dataset.id);
    const campo = input.dataset.campo;
    const limpo = L.limparEntrada(input.value);
    if (limpo !== input.value) {
      const fim = Math.max(0, (input.selectionEnd ?? limpo.length) - (input.value.length - limpo.length));
      input.value = limpo;
      try {
        input.setSelectionRange(fim, fim);
      } catch (erro) {
        /* Navegador sem seleção neste tipo de campo. */
      }
    }
    rascunhos.set(`${id}:${campo}`, limpo);
    marcarInvalido(input);
    const valor = limpo.trim() === "" ? null : L.analisar(limpo);
    // Texto inválido não apaga o valor anterior, como no app
    if (limpo.trim() !== "" && valor === null) return;
    itens = campo === "quantidade" ? L.definirQuantidade(itens, id, valor) : L.definirPreco(itens, id, valor);
    salvar();
    const item = itens.find((i) => i.id === id);
    const subtotal = listaCompras.querySelector(`[data-subtotal="${id}"]`);
    if (item && subtotal) subtotal.textContent = L.formatarMoeda(L.subtotal(item));
    desenharTotais();
  });

  $("#lc-escolher").addEventListener("click", () => mostrarAba("itens", true));

  // ---------- Finalizar compra ----------

  function abrir(dialogo) {
    if (typeof dialogo.showModal === "function") dialogo.showModal();
    else dialogo.setAttribute("open", "");
  }

  function fechar(dialogo) {
    if (typeof dialogo.close === "function") dialogo.close();
    else dialogo.removeAttribute("open");
  }

  $("#lc-finalizar").addEventListener("click", () => {
    const r = L.resumo(itens);
    const naoComprados = r.quantidadeItens - r.quantidadeComprados;
    $("#lc-finalizar-total").textContent = `Total no carrinho: ${L.formatarMoeda(r.totalCarrinho)}`;
    linhaManter.hidden = naoComprados === 0;
    caixaManter.checked = false;
    $("#lc-manter-texto").textContent =
      naoComprados === 1 ? "Manter na lista o item não marcado" : `Manter na lista os ${naoComprados} itens não marcados`;
    abrir(dialogoFinalizar);
  });

  $("#lc-finalizar-cancelar").addEventListener("click", () => {
    fechar(dialogoFinalizar);
    $("#lc-finalizar").focus();
  });

  $("#lc-finalizar-confirmar").addEventListener("click", () => {
    const r = L.resumo(itens);
    const manter = caixaManter.checked && r.quantidadeItens > r.quantidadeComprados;
    for (const item of itens) if (item.naLista && (item.comprado || !manter)) limparRascunhos(item.id);
    fechar(dialogoFinalizar);
    esconderAviso();
    alterar(L.finalizarCompra(itens, manter));
    $("#lc-finalizada-total").textContent = `Total gasto: ${L.formatarMoeda(r.totalCarrinho)}`;
    abrir(dialogoFinalizada);
  });

  $("#lc-finalizada-ok").addEventListener("click", () => {
    fechar(dialogoFinalizada);
    (rodape.hidden ? $("#lc-escolher") : $("#lc-finalizar")).focus();
  });

  // ---------- Abas e outras janelas ----------

  for (const botao of botoesAba) botao.addEventListener("click", () => mostrarAba(botao.dataset.aba));

  window.addEventListener("storage", (evento) => {
    if (evento.key !== CHAVE_ITENS) return;
    itens = L.lerItens(evento.newValue);
    // Os valores vindos da outra aba substituem o que estava escrito, menos no campo em uso
    const emUso = document.activeElement?.dataset?.campo ? `${document.activeElement.dataset.id}:${document.activeElement.dataset.campo}` : null;
    for (const chave of [...rascunhos.keys()]) if (chave !== emUso) rascunhos.delete(chave);
    if (editandoId !== null && !itens.some((i) => i.id === editandoId)) cancelarEdicao();
    else desenhar();
  });

  carregar();
  mostrarAba(aba);
  desenhar();
})();
