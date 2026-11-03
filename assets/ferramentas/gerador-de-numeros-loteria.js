"use strict";
/*
 * Interface do gerador de números da loteria. Versão web das telas do app Gerar Números Loteria
 * (ui/telas/jogos/Jogos.kt, ui/componentes/CampoQuantidade.kt e GeradorExtra.kt): uma modalidade
 * por vez, campo de quantidade onde o app deixa escolher e botão para gerar. A lógica fica em
 * gerador-de-numeros-loteria-logica.js.
 */
(() => {
  const raiz = document.querySelector("#loteria");
  if (!raiz) return;

  const L = LogicaLoteria;
  const CHAVE = "efs-gerador-de-numeros-loteria-preferencias";

  const botoesModalidade = [...raiz.querySelectorAll("[data-modalidade]")];
  const form = raiz.querySelector("#loteria-form");
  const campoQuantidade = raiz.querySelector("#campo-quantidade");
  const quantidade = raiz.querySelector("#quantidade");
  const dica = raiz.querySelector("#quantidade-dica");
  const fixa = raiz.querySelector("#quantidade-fixa");
  const chance = raiz.querySelector("#chance");
  const botaoExtra = raiz.querySelector("#sortear-extra");
  const resultado = raiz.querySelector("#resultado");
  const botaoCopiar = raiz.querySelector("#copiar");
  const copiado = raiz.querySelector("#copiado");

  /** Como é a aposta nas modalidades em que o app não deixa mudar a quantidade. */
  const APOSTA_FIXA = {
    lotomania: "Aposta de 50 números, de 00 a 99.",
    timemania: "Aposta de 10 números, de 01 a 80, mais o time do coração.",
    "mais-milionaria": "6 números de 01 a 50 e 2 trevos de 1 a 6.",
    "super-sete": "Um número de 0 a 9 em cada uma das 7 colunas.",
    loteca: "Um palpite (1, X ou 2) para cada um dos 14 jogos.",
  };

  let preferencias = { modalidade: L.MODALIDADES[0].id, quantidades: {} };
  try {
    const salvas = L.validarPreferencias(JSON.parse(localStorage.getItem(CHAVE)));
    if (salvas) preferencias = salvas;
  } catch {
    // Sem localStorage ou JSON inválido: começa na Mega-Sena
  }

  let atual = L.modalidade(preferencias.modalidade);
  let jogo = null;
  let tempoCopiado = 0;

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(preferencias));
    } catch {
      // Sem armazenamento, a escolha vale só nesta visita
    }
  }

  const editavel = (m) => m.min !== m.max;
  const quantidadeSalva = (m) => preferencias.quantidades[m.id] ?? m.padrao;

  // ---------- Modalidade e quantidade ----------

  function selecionar(id) {
    const m = L.modalidade(id);
    if (!m) return;
    atual = m;
    preferencias.modalidade = m.id;
    salvar();

    for (const botao of botoesModalidade) {
      const ativo = botao.dataset.modalidade === m.id;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }

    campoQuantidade.hidden = !editavel(m);
    fixa.hidden = editavel(m);
    if (editavel(m)) {
      quantidade.value = String(quantidadeSalva(m));
      quantidade.removeAttribute("aria-invalid");
      dica.textContent = `Entre ${m.min} e ${m.max} números, de 01 a ${m.maxValor}.`;
    } else {
      fixa.textContent = APOSTA_FIXA[m.id] || "";
    }

    const extra = m.mesDaSorte ? "Sortear só o mês" : m.timeDoCoracao ? "Sortear só o time" : "";
    botaoExtra.hidden = !extra;
    botaoExtra.textContent = extra;

    jogo = null;
    mostrarJogo();
    atualizarChance();
  }

  function atualizarChance() {
    if (!editavel(atual)) {
      chance.textContent = L.textoChance(atual, atual.padrao);
      return;
    }
    const n = L.lerQuantidade(quantidade.value, atual);
    chance.textContent =
      n === null
        ? `Digite uma quantidade entre ${atual.min} e ${atual.max} para ver a chance.`
        : L.textoChance(atual, n);
  }

  /** Quantidade em uso: a digitada, corrigida como o app faz ao sair do campo. */
  function corrigir() {
    if (!editavel(atual)) return atual.padrao;
    const n = L.corrigirQuantidade(quantidade.value, atual);
    quantidade.value = String(n);
    quantidade.removeAttribute("aria-invalid");
    preferencias.quantidades[atual.id] = n;
    salvar();
    atualizarChance();
    return n;
  }

  // ---------- Resultado ----------

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function listaDeBolas(numeros, rotulo, classeExtra = "") {
    const lista = elemento("ol", `loteria-bolas${classeExtra}`);
    lista.setAttribute("aria-label", rotulo);
    for (const n of numeros) lista.append(elemento("li", "loteria-bola", n));
    return lista;
  }

  function tabelaLoteca(palpites) {
    const envoltorio = elemento("div", "table-wrap loteria-loteca");
    const tabela = elemento("table", "data");
    tabela.append(elemento("caption", "sr-only", "Palpites da Loteca"));
    const cabecalho = elemento("tr");
    cabecalho.append(elemento("th", "", "Jogo"));
    for (const opcao of L.OPCOES_LOTECA) {
      const th = elemento("th");
      const abreviacao = elemento("abbr", "", opcao);
      abreviacao.title = L.NOMES_LOTECA[opcao];
      th.append(abreviacao);
      cabecalho.append(th);
    }
    for (const th of cabecalho.children) th.scope = "col";
    const thead = elemento("thead");
    thead.append(cabecalho);

    const tbody = elemento("tbody");
    palpites.forEach((palpite, i) => {
      const linha = elemento("tr");
      const nome = elemento("th", "", `Jogo ${i + 1}`);
      nome.scope = "row";
      linha.append(nome);
      for (const opcao of L.OPCOES_LOTECA) {
        const celula = elemento("td", opcao === palpite ? "marcado" : "", opcao);
        if (opcao === palpite) celula.append(elemento("span", "sr-only", " (marcado)"));
        linha.append(celula);
      }
      tbody.append(linha);
    });
    tabela.append(thead, tbody);
    envoltorio.append(tabela);
    return envoltorio;
  }

  function extras() {
    const lista = elemento("dl", "result-list");
    const linha = (rotulo, valor) => {
      const div = elemento("div");
      div.append(elemento("dt", "", rotulo), elemento("dd", "", valor));
      lista.append(div);
    };
    if (jogo.mes) linha("Mês da sorte", jogo.mes);
    if (jogo.time) linha("Time do coração", jogo.time);
    return lista.children.length ? lista : null;
  }

  function mostrarJogo() {
    resultado.replaceChildren();
    botaoCopiar.disabled = !jogo;
    copiado.textContent = "";
    if (!jogo) {
      resultado.append(
        elemento("p", "result-message", `Use o botão Gerar números para montar um jogo de ${atual.titulo}.`),
      );
      return;
    }

    const formatar = (n) => L.formatarNumero(atual, n);
    if (jogo.numeros) {
      const titulo = `${atual.titulo} · ${jogo.numeros.length} números`;
      resultado.append(elemento("p", "result-label", titulo));
      const classe = jogo.numeros.length > 20 ? " loteria-muitas" : "";
      resultado.append(listaDeBolas(jogo.numeros.map(formatar), "Números gerados", classe));
    }
    if (jogo.trevos) {
      resultado.append(elemento("p", "result-label", "Trevos"));
      resultado.append(listaDeBolas(jogo.trevos.map(String), "Trevos gerados", " loteria-trevos"));
    }
    if (jogo.colunas) {
      resultado.append(elemento("p", "result-label", `${atual.titulo} · 7 colunas`));
      const lista = elemento("ol", "loteria-colunas");
      lista.setAttribute("aria-label", "Número de cada coluna");
      jogo.colunas.forEach((digito, i) => {
        const item = elemento("li");
        item.append(elemento("span", "loteria-coluna-nome", `Coluna ${i + 1}`));
        const bola = elemento("span", "loteria-bola", String(digito));
        item.append(bola);
        lista.append(item);
      });
      resultado.append(lista);
    }
    if (jogo.palpites) {
      resultado.append(elemento("p", "result-label", `${atual.titulo} · 14 jogos`));
      resultado.append(tabelaLoteca(jogo.palpites));
    }
    if (!jogo.numeros && (jogo.mes || jogo.time)) {
      resultado.append(elemento("p", "result-label", atual.titulo));
    }
    const lista = extras();
    if (lista) resultado.append(lista);
  }

  function gerar() {
    const n = corrigir();
    jogo = L.gerar(atual, n);
    mostrarJogo();
  }

  /** Como o botão do mês e do time no app: sorteia só essa parte, mantendo os números. */
  function sortearExtra() {
    if (!jogo) jogo = { modalidade: atual.id };
    if (atual.mesDaSorte) jogo.mes = L.mesDaSorte();
    if (atual.timeDoCoracao) jogo.time = L.timeDoCoracao();
    mostrarJogo();
  }

  async function copiar() {
    if (!jogo) return;
    clearTimeout(tempoCopiado);
    try {
      await navigator.clipboard.writeText(L.textoDoJogo(atual, jogo));
      copiado.textContent = "Números copiados.";
    } catch {
      copiado.textContent = "Não deu para copiar aqui. Selecione os números e copie à mão.";
    }
    tempoCopiado = setTimeout(() => {
      copiado.textContent = "";
    }, 4000);
  }

  // ---------- Eventos ----------

  for (const botao of botoesModalidade) {
    botao.addEventListener("click", () => selecionar(botao.dataset.modalidade));
  }

  quantidade.addEventListener("input", () => {
    const limpo = L.limparQuantidade(quantidade.value);
    if (limpo !== quantidade.value) quantidade.value = limpo;
    const valida = L.lerQuantidade(limpo, atual) !== null;
    if (limpo && !valida) quantidade.setAttribute("aria-invalid", "true");
    else quantidade.removeAttribute("aria-invalid");
    atualizarChance();
  });
  quantidade.addEventListener("change", corrigir);

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    gerar();
  });
  botaoExtra.addEventListener("click", sortearExtra);
  botaoCopiar.addEventListener("click", copiar);

  selecionar(atual.id);
})();
