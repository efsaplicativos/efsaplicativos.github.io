"use strict";
/*
 * Tela do conversor de bases: abas Números e Texto.
 * Comportamento portado de ui/tools/bases/BasesScreen.kt (Calculadora Multifunção);
 * as contas ficam em conversor-de-bases-logica.js. A base escolhida, a base
 * personalizada e o último número ficam no localStorage; o texto da aba Texto não é guardado.
 */
(() => {
  const raiz = document.querySelector("#conversor-bases");
  if (!raiz) return;
  const C = ConversorDeBases;

  const CHAVE = "efs-conversor-de-bases-estado";
  const BASES_FIXAS = ["2", "8", "10", "16"];
  const FORMATOS = ["binario", "hexadecimal", "decimal"];
  const PADRAO = { aba: "numeros", base: "10", personalizada: "3", numero: "255", formato: "binario" };
  const TEXTO_INICIAL = "Olá";
  // Mesmo filtro do app: letras, dígitos e "-.,_ −+"
  const CARACTERE_PERMITIDO = /[\p{L}\p{N}\-.,_ −+]/u;

  function carregar() {
    const estado = { ...PADRAO };
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (salvo && typeof salvo === "object") {
        if (salvo.aba === "numeros" || salvo.aba === "texto") estado.aba = salvo.aba;
        if (BASES_FIXAS.includes(salvo.base) || salvo.base === "outra") estado.base = salvo.base;
        if (typeof salvo.personalizada === "string" && salvo.personalizada.length <= 3) estado.personalizada = salvo.personalizada;
        if (typeof salvo.numero === "string" && salvo.numero.length <= 500) estado.numero = salvo.numero;
        if (FORMATOS.includes(salvo.formato)) estado.formato = salvo.formato;
      }
    } catch (erro) {
      // Sem armazenamento: segue com o padrão
    }
    return estado;
  }
  const estado = carregar();
  // A direção não é guardada: só faz sentido junto com o texto, que também não é
  estado.direcao = "codificar";

  function salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({
          aba: estado.aba,
          base: estado.base,
          personalizada: campoPersonalizada.value,
          numero: campoNumero.value,
          formato: estado.formato,
        }),
      );
    } catch (erro) {
      // Armazenamento indisponível: nada a fazer
    }
  }

  const $ = (seletor) => raiz.querySelector(seletor);
  const criar = (tag, classe, texto) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const marcar = (botoes, atributo, valor) =>
    botoes.forEach((b) => {
      const ativo = b.dataset[atributo] === valor;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    });

  /** Copia o texto e mostra o retorno no próprio botão; depois volta ao conteúdo original. */
  async function copiar(botao, texto, restaurar) {
    let copiou = false;
    try {
      await navigator.clipboard.writeText(texto);
      copiou = true;
    } catch (erro) {
      copiou = false;
    }
    botao.textContent = copiou ? "Copiado" : "Não foi possível copiar";
    clearTimeout(botao.temporizador);
    botao.temporizador = setTimeout(restaurar, 1600);
  }

  /** Linha com rótulo, valor em fonte monoespaçada e botão de copiar. */
  function linhaCopiavel(rotulo, valores, textoCopia) {
    const li = criar("li", "bas-linha");
    const corpo = criar("div", "bas-linha-corpo");
    corpo.append(criar("span", "bas-rotulo", rotulo));
    valores.forEach((v) => corpo.append(criar("code", "bas-valor", v)));
    const botao = criar("button", "button secondary bas-pequeno");
    botao.type = "button";
    const rotular = () => botao.replaceChildren("Copiar", criar("span", "sr-only", ` ${rotulo}`));
    rotular();
    botao.addEventListener("click", () => copiar(botao, textoCopia, rotular));
    li.append(corpo, botao);
    return li;
  }

  // ---------- Abas ----------

  const botoesAba = [...raiz.querySelectorAll("[data-aba]")];
  const painelNumeros = $("#bas-numeros");
  const painelTexto = $("#bas-texto-painel");

  function mostrarAba() {
    marcar(botoesAba, "aba", estado.aba);
    painelNumeros.hidden = estado.aba !== "numeros";
    painelTexto.hidden = estado.aba !== "texto";
  }
  botoesAba.forEach((b) =>
    b.addEventListener("click", () => {
      estado.aba = b.dataset.aba;
      mostrarAba();
      salvar();
    }),
  );

  // ---------- Números ----------

  const botoesBase = [...raiz.querySelectorAll("[data-base]")];
  const blocoPersonalizada = $("#bas-campo-personalizada");
  const campoPersonalizada = $("#bas-personalizada");
  const erroPersonalizada = $("#bas-personalizada-erro");
  const campoNumero = $("#bas-numero");
  const rotuloNumero = $("#bas-numero-rotulo");
  const dicaNumero = $("#bas-numero-dica");
  const listaConversoes = $("#bas-conversoes");
  const notaTruncado = $("#bas-truncado");
  const vazio = $("#bas-vazio");
  const blocoComplemento = $("#bas-complemento-bloco");
  const bitsTotal = $("#bas-bits-total");
  const bitsUm = $("#bas-bits-um");
  const listaComplemento = $("#bas-complemento");
  const complementoVazio = $("#bas-complemento-vazio");
  const anuncio = $("#bas-anuncio");
  const DICA_NUMERO = dicaNumero.textContent;

  campoPersonalizada.value = estado.personalizada;
  campoNumero.value = estado.numero;

  /** Base atual, ou null se "Outra base" estiver com um valor inválido. */
  function baseAtual() {
    if (estado.base !== "outra") return Number(estado.base);
    return C.lerBasePersonalizada(campoPersonalizada.value);
  }

  let temporizadorAnuncio;
  function anunciar(texto) {
    clearTimeout(temporizadorAnuncio);
    temporizadorAnuncio = setTimeout(() => {
      anuncio.textContent = texto;
    }, 600);
  }

  const inteiroPtBr = (n) => n.toLocaleString("pt-BR");

  function atualizarNumeros() {
    marcar(botoesBase, "base", estado.base);
    blocoPersonalizada.hidden = estado.base !== "outra";
    const base = baseAtual();
    const personalizadaInvalida = estado.base === "outra" && base === null && campoPersonalizada.value.trim() !== "";
    erroPersonalizada.hidden = !personalizadaInvalida;
    campoPersonalizada.setAttribute("aria-invalid", String(personalizadaInvalida));

    rotuloNumero.textContent = `Número em ${base === null ? "?" : C.nomeBase(base)}`;
    // Teclado com letras só quando a base usa letras (acima de 10)
    campoNumero.setAttribute("inputmode", (base ?? 16) > 10 ? "text" : "decimal");

    const numero = base === null ? null : C.ler(campoNumero.value, base);
    const invalido = base !== null && campoNumero.value.trim() !== "" && numero === null;
    campoNumero.setAttribute("aria-invalid", String(invalido));
    dicaNumero.textContent = invalido ? `Há dígitos inválidos para ${C.nomeBase(base)}.` : DICA_NUMERO;
    dicaNumero.classList.toggle("bas-erro", invalido);

    listaConversoes.replaceChildren();
    listaComplemento.replaceChildren();
    if (numero === null) {
      notaTruncado.hidden = true;
      blocoComplemento.hidden = true;
      vazio.hidden = false;
      vazio.textContent = invalido
        ? "Corrija o número para ver as conversões."
        : base === null
          ? "Escolha uma base de 2 a 36."
          : "Digite um número para ver as conversões.";
      anunciar(invalido ? dicaNumero.textContent : "");
      return;
    }
    vazio.hidden = true;

    const conversoes = C.conversoes(numero, base);
    conversoes.forEach((c) => listaConversoes.append(linhaCopiavel(c.nome, [c.agrupado], c.simples)));
    notaTruncado.hidden = !conversoes.some((c) => c.truncado);

    blocoComplemento.hidden = C.temFracao(numero);
    if (!C.temFracao(numero)) {
      bitsTotal.textContent = inteiroPtBr(C.quantidadeDeBits(numero.inteiro));
      bitsUm.textContent = inteiroPtBr(C.bitsLigados(numero.inteiro));
      const linhas = C.linhasComplemento(numero);
      linhas.forEach((l) => listaComplemento.append(linhaCopiavel(`${l.bits} bits`, [l.binarioAgrupado, l.hexAgrupado], l.binario)));
      complementoVazio.hidden = linhas.length > 0;
    }

    const porBase = Object.fromEntries(conversoes.map((c) => [c.base, c.simples]));
    anunciar(`Binário ${porBase[2]}; octal ${porBase[8]}; decimal ${porBase[10]}; hexadecimal ${porBase[16]}.`);
  }

  /** Remove caracteres fora do filtro do app, sem perder a posição do cursor. */
  function filtrarNumero() {
    const valor = campoNumero.value;
    if ([...valor].every((c) => CARACTERE_PERMITIDO.test(c))) return;
    const cursor = campoNumero.selectionStart ?? valor.length;
    const antes = [...valor.slice(0, cursor)].filter((c) => CARACTERE_PERMITIDO.test(c)).join("");
    const depois = [...valor.slice(cursor)].filter((c) => CARACTERE_PERMITIDO.test(c)).join("");
    campoNumero.value = antes + depois;
    campoNumero.setSelectionRange(antes.length, antes.length);
  }

  botoesBase.forEach((b) =>
    b.addEventListener("click", () => {
      estado.base = b.dataset.base;
      atualizarNumeros();
      salvar();
      if (estado.base === "outra") campoPersonalizada.focus();
    }),
  );
  campoPersonalizada.addEventListener("input", () => {
    atualizarNumeros();
    salvar();
  });
  campoNumero.addEventListener("input", () => {
    filtrarNumero();
    atualizarNumeros();
    salvar();
  });

  // Teclados numéricos de alguns celulares não têm o sinal de menos
  const sinal = $("#bas-sinal");
  sinal.addEventListener("pointerdown", (e) => e.preventDefault());
  sinal.addEventListener("click", () => {
    const valor = campoNumero.value.trim();
    if (valor.startsWith("-") || valor.startsWith("−")) campoNumero.value = valor.slice(1);
    else campoNumero.value = `-${valor.startsWith("+") ? valor.slice(1) : valor}`;
    atualizarNumeros();
    salvar();
    campoNumero.focus();
  });
  $("#bas-limpar").addEventListener("click", () => {
    campoNumero.value = "";
    atualizarNumeros();
    salvar();
    campoNumero.focus();
  });
  $("#bas-form-numeros").addEventListener("submit", (e) => e.preventDefault());

  // ---------- Texto ----------

  const botoesDirecao = [...raiz.querySelectorAll("[data-direcao]")];
  const botoesFormato = [...raiz.querySelectorAll("[data-formato]")];
  const campoTexto = $("#bas-texto");
  const rotuloTexto = $("#bas-texto-rotulo");
  const saida = $("#bas-saida");
  const bytes = $("#bas-bytes");
  const textoVazio = $("#bas-texto-vazio");
  const textoErro = $("#bas-texto-erro");
  const textoAcoes = $("#bas-texto-acoes");
  const botaoCopiarTexto = $("#bas-texto-copiar");
  const anuncioTexto = $("#bas-texto-anuncio");

  campoTexto.value = TEXTO_INICIAL;
  let temporizadorTexto;

  function atualizarTexto() {
    marcar(botoesDirecao, "direcao", estado.direcao);
    marcar(botoesFormato, "formato", estado.formato);
    const codificando = estado.direcao === "codificar";
    rotuloTexto.textContent = codificando ? "Texto" : "Códigos dos bytes (separados por espaço)";
    campoTexto.classList.toggle("bas-mono", !codificando);
    campoTexto.spellcheck = codificando;
    campoTexto.placeholder = codificando ? "Ex.: Olá" : "Ex.: 4F 6C C3 A1";
    saida.classList.toggle("bas-mono", codificando);

    const r = C.converterTexto(campoTexto.value, estado.direcao, estado.formato);
    const ok = r.tipo === "ok";
    saida.hidden = !ok;
    bytes.hidden = !ok;
    textoAcoes.hidden = !ok;
    textoVazio.hidden = r.tipo !== "vazio";
    textoErro.hidden = r.tipo !== "erro";
    campoTexto.setAttribute("aria-invalid", String(r.tipo === "erro"));
    if (ok) {
      saida.textContent = r.texto;
      bytes.textContent = C.textoBytes(r.bytes);
    } else {
      saida.textContent = "";
      bytes.textContent = "";
    }
    if (r.tipo === "erro") textoErro.textContent = r.mensagem;

    clearTimeout(temporizadorTexto);
    temporizadorTexto = setTimeout(() => {
      anuncioTexto.textContent = ok ? C.textoBytes(r.bytes) : r.tipo === "erro" ? r.mensagem : "";
    }, 600);
  }

  botoesDirecao.forEach((b) =>
    b.addEventListener("click", () => {
      const nova = b.dataset.direcao;
      if (nova === estado.direcao) return;
      // Ao inverter a direção, reaproveita o resultado como nova entrada
      const atual = C.converterTexto(campoTexto.value, estado.direcao, estado.formato);
      estado.direcao = nova;
      if (atual.tipo === "ok") campoTexto.value = atual.texto;
      atualizarTexto();
      salvar();
    }),
  );
  botoesFormato.forEach((b) =>
    b.addEventListener("click", () => {
      const novo = b.dataset.formato;
      if (estado.direcao === "decodificar" && novo !== estado.formato) {
        // Reescreve os códigos já digitados no novo formato
        const lido = C.decodificar(campoTexto.value, estado.formato);
        if (lido.tipo === "ok") campoTexto.value = C.codificar(lido.texto, novo);
      }
      estado.formato = novo;
      atualizarTexto();
      salvar();
    }),
  );
  campoTexto.addEventListener("input", atualizarTexto);
  $("#bas-texto-limpar").addEventListener("click", () => {
    campoTexto.value = "";
    atualizarTexto();
    campoTexto.focus();
  });
  botaoCopiarTexto.addEventListener("click", () =>
    copiar(botaoCopiarTexto, saida.textContent, () => {
      botaoCopiarTexto.textContent = "Copiar";
    }),
  );
  $("#bas-form-texto").addEventListener("submit", (e) => e.preventDefault());

  mostrarAba();
  atualizarNumeros();
  atualizarTexto();
})();
