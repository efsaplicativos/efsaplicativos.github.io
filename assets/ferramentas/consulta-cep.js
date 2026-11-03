"use strict";
/*
 * Interface da Consulta CEP. A lógica (máscara, URLs, leitura da ViaCEP, erros e busca nos
 * 27 estados) está em consulta-cep-logica.js; a tela segue ui/telas/TelaPesquisa.kt,
 * FormularioCep.kt, FormularioEndereco.kt, PesquisaViewModel.kt e componentes/CartaoEndereco.kt
 * do app Pesquisa CEP. Só consulta viacep.com.br.
 */
(() => {
  const raiz = document.querySelector("#cep");
  if (!raiz || typeof LogicaCep !== "object") return;
  const L = LogicaCep;
  const { Cep, Endereco, ValidacaoEndereco } = L;

  const CHAVE = "efs-consulta-cep-campos";
  const TEMPO_AVISO = 4000;
  const NAO_ENCONTRADO = ["CEP_NAO_ENCONTRADO", "NENHUM_RESULTADO", "NENHUM_RESULTADO_PARCIAL"];
  const podeCompartilhar = typeof navigator.share === "function";

  const $ = (seletor) => raiz.querySelector(seletor);
  const el = {
    abas: [...raiz.querySelectorAll("[data-aba]")],
    painelCep: $("#cep-painel-cep"),
    painelRua: $("#cep-painel-rua"),
    formCep: $("#cep-form"),
    campoCep: $("#cep-numero"),
    limpar: $("#cep-limpar"),
    buscarCep: $("#cep-buscar"),
    resultadoCep: $("#cep-resultado"),
    formRua: $("#cep-form-rua"),
    instrucaoRua: $("#cep-instrucao-rua"),
    uf: $("#cep-uf"),
    cidade: $("#cep-cidade"),
    logradouro: $("#cep-logradouro"),
    buscarRua: $("#cep-buscar-rua"),
    progresso: $("#cep-progresso"),
    progressoBarra: $("#cep-progresso-barra"),
    progressoTexto: $("#cep-progresso-texto"),
    resultadoRua: $("#cep-resultado-rua"),
    lista: $("#cep-lista"),
    toast: $("#cep-toast"),
    status: $("#cep-status"),
  };

  // As dicas iniciais estão no HTML; guardadas para voltar a elas quando um erro some
  const dicaCep = el.resultadoCep.firstElementChild.cloneNode(true);
  const dicaRua = el.resultadoRua.firstElementChild.cloneNode(true);
  el.resultadoCep.tabIndex = -1;
  el.resultadoRua.tabIndex = -1;

  const repositorio = L.criarRepositorio(
    L.criarCliente((url, opcoes) => fetch(url, opcoes), { online: () => navigator.onLine }),
  );

  // Campos como no PesquisaViewModel.kt; trocar de aba não apaga nada
  const estado = {
    aba: "cep",
    cep: "",
    uf: "",
    cidade: "",
    logradouro: "",
    buscaCep: { tipo: "ocioso" },
    buscaRua: { tipo: "ocioso" },
  };
  let ultimoCepBuscado = "";
  let sequenciaCep = 0;
  let sequenciaRua = 0;

  function carregarCampos() {
    let salvo = null;
    try {
      salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    } catch (erro) {
      salvo = null;
    }
    if (!salvo || typeof salvo !== "object" || Array.isArray(salvo)) return;
    const texto = (valor) => (typeof valor === "string" ? valor.slice(0, 120) : "");
    if (salvo.aba === "cep" || salvo.aba === "rua") estado.aba = salvo.aba;
    estado.cep = Cep.limpar(texto(salvo.cep));
    estado.uf = L.estadoPorSigla(salvo.uf) ? salvo.uf : "";
    estado.cidade = texto(salvo.cidade);
    estado.logradouro = texto(salvo.logradouro);
  }

  function salvarCampos() {
    const { aba, cep, uf, cidade, logradouro } = estado;
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ aba, cep, uf, cidade, logradouro }));
    } catch (erro) {
      // Sem armazenamento (modo privado, bloqueio): os campos só não são lembrados
    }
  }

  // ---------- Utilidades de tela ----------

  function criar(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function botao(texto, classe, aoClicar) {
    const elemento = criar("button", classe, texto);
    elemento.type = "button";
    elemento.addEventListener("click", aoClicar);
    return elemento;
  }

  // aria-disabled em vez de disabled: o foco não se perde durante a busca
  function habilitar(elemento, sim) {
    if (sim) elemento.removeAttribute("aria-disabled");
    else elemento.setAttribute("aria-disabled", "true");
  }

  /** Troca o conteúdo; se o foco estava lá dentro (ex.: "Tentar novamente"), ele fica no bloco. */
  function substituir(recipiente, ...filhos) {
    const tinhaFoco = recipiente.contains(document.activeElement) && document.activeElement !== recipiente;
    recipiente.replaceChildren(...filhos);
    if (tinhaFoco) recipiente.focus();
  }

  let temporizadorStatus = 0;
  function anunciar(texto) {
    clearTimeout(temporizadorStatus);
    el.status.textContent = "";
    // Limpar antes garante que a mesma frase seja lida de novo
    temporizadorStatus = setTimeout(() => {
      el.status.textContent = texto;
    }, 60);
  }

  const anunciarErro = (nome) => anunciar(`${L.ERROS[nome].titulo}. ${L.ERROS[nome].mensagem}`);

  let temporizadorAviso = 0;
  function mostrarAviso(texto) {
    clearTimeout(temporizadorAviso);
    el.toast.replaceChildren(criar("p", "cep-toast-caixa", texto));
    temporizadorAviso = setTimeout(() => el.toast.replaceChildren(), TEMPO_AVISO);
  }

  const fonte = (instante) => `Dados do ViaCEP (viacep.com.br), consultados em ${L.dataHora(instante)}`;

  // ---------- Ações do endereço (Acoes.kt) ----------

  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (erro) {
      // Sem permissão: tenta o jeito antigo abaixo
    }
    const foco = document.activeElement;
    try {
      const area = criar("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const copiou = document.execCommand("copy");
      area.remove();
      return copiou;
    } catch (erro) {
      return false;
    } finally {
      if (foco instanceof HTMLElement) foco.focus();
    }
  }

  async function copiar(endereco, apenasCep) {
    const cep = Endereco.cepFormatado(endereco);
    const copiou = await copiarTexto(apenasCep ? cep : Endereco.textoCompleto(endereco));
    if (!copiou) mostrarAviso("Não foi possível copiar. Selecione o texto e copie manualmente.");
    else mostrarAviso(apenasCep ? `CEP ${cep} copiado` : "Endereço copiado");
  }

  async function compartilhar(endereco) {
    try {
      await navigator.share({ text: Endereco.textoCompleto(endereco) });
    } catch (erro) {
      // Cancelar a janela de compartilhar não é erro; outras falhas copiam o endereço
      if (erro && erro.name === "AbortError") return;
      await copiar(endereco, false);
    }
  }

  // ---------- Cartões (CartaoEndereco.kt e Avisos.kt) ----------

  /** [detalhado]: resultado da busca por CEP, com Estado/DDD/IBGE; senão, item da lista por rua. */
  function cartaoEndereco(endereco, detalhado, instante) {
    const cepFormatado = Endereco.cepFormatado(endereco);
    const cartao = criar(detalhado ? "div" : "li", detalhado ? "cep-cartao cep-cartao-detalhado" : "cep-cartao");

    const topo = criar("div", "cep-cartao-topo");
    const chip = criar("p", "cep-chip-cep");
    chip.append(criar("span", "sr-only", "CEP "), document.createTextNode(cepFormatado));
    topo.append(chip);
    if (endereco.uf.trim()) topo.append(criar("p", "cep-chip-uf", endereco.uf));
    cartao.append(topo);

    const geral = Endereco.cepGeralDoMunicipio(endereco);
    cartao.append(
      criar("p", geral ? "cep-logradouro cep-geral" : "cep-logradouro", geral ? "CEP geral do município" : endereco.logradouro),
    );
    const detalhe = Endereco.detalhe(endereco);
    if (detalhe) cartao.append(criar("p", "cep-detalhe", detalhe));
    const bairroCidade = Endereco.bairroCidade(endereco);
    if (bairroCidade) cartao.append(criar("p", "cep-bairro", bairroCidade));

    if (detalhado) {
      const extras = [
        ["Estado", endereco.estado],
        ["DDD", endereco.ddd],
        ["IBGE", endereco.ibge],
      ].filter(([, valor]) => valor.trim() !== "");
      if (extras.length > 0) {
        const lista = criar("dl", "cep-extras");
        for (const [rotulo, valor] of extras) {
          const item = criar("div");
          item.append(criar("dt", "", rotulo), criar("dd", "", valor));
          lista.append(item);
        }
        cartao.append(lista);
      }
    }

    const acoes = criar("div", "cep-acoes");
    const copiarBotao = botao(detalhado ? "Copiar" : "Copiar CEP", "cep-acao", () => copiar(endereco, !detalhado));
    if (!detalhado) copiarBotao.setAttribute("aria-label", `Copiar CEP ${cepFormatado}`);
    acoes.append(copiarBotao);
    if (podeCompartilhar) {
      const compartilharBotao = botao("Compartilhar", "cep-acao", () => compartilhar(endereco));
      if (!detalhado) compartilharBotao.setAttribute("aria-label", `Compartilhar endereço do CEP ${cepFormatado}`);
      acoes.append(compartilharBotao);
    }
    const mapa = criar("a", "cep-acao", "Ver no mapa");
    mapa.href = Endereco.urlMapa(endereco);
    mapa.target = "_blank";
    mapa.rel = "noopener noreferrer";
    mapa.setAttribute(
      "aria-label",
      detalhado ? "Ver no mapa (abre em outra aba)" : `Ver no mapa: CEP ${cepFormatado} (abre em outra aba)`,
    );
    const seta = criar("span", "", " ↗");
    seta.setAttribute("aria-hidden", "true");
    mapa.append(seta);
    acoes.append(mapa);
    cartao.append(acoes);

    if (detalhado) cartao.append(criar("p", "cep-fonte", fonte(instante)));
    return cartao;
  }

  function cartaoErro(nome, aoTentarDeNovo) {
    const erro = L.ERROS[nome];
    const cartao = criar("div", NAO_ENCONTRADO.includes(nome) ? "cep-aviso" : "cep-aviso cep-aviso-erro");
    cartao.append(criar("p", "cep-aviso-titulo", erro.titulo), criar("p", "cep-aviso-texto", erro.mensagem));
    if (erro.podeTentarDeNovo) cartao.append(botao("Tentar novamente", "cep-link", aoTentarDeNovo));
    return cartao;
  }

  const carregando = (texto) => criar("p", "cep-carregando", texto);

  // ---------- Abas ----------

  function mostrarAba(aba, focar = false) {
    estado.aba = aba;
    for (const botaoAba of el.abas) {
      const ativa = botaoAba.dataset.aba === aba;
      botaoAba.classList.toggle("active", ativa);
      botaoAba.setAttribute("aria-pressed", String(ativa));
    }
    el.painelCep.hidden = aba !== "cep";
    el.painelRua.hidden = aba !== "rua";
    salvarCampos();
    if (focar) (aba === "cep" ? el.campoCep : el.cidade).focus();
  }

  for (const botaoAba of el.abas) {
    botaoAba.addEventListener("click", () => mostrarAba(botaoAba.dataset.aba));
  }

  raiz.addEventListener("click", (evento) => {
    const atalho = evento.target.closest("[data-ir-para]");
    if (atalho) mostrarAba(atalho.dataset.irPara, true);
  });

  // ---------- Busca por CEP (FormularioCep.kt) ----------

  let valorAnterior = "";

  function definirCep(digitos, cursorDigitos = null) {
    estado.cep = digitos;
    const formatado = Cep.formatar(digitos);
    el.campoCep.value = formatado;
    valorAnterior = formatado;
    if (cursorDigitos !== null && document.activeElement === el.campoCep) {
      const posicao = Math.min(Cep.posicaoNaMascara(cursorDigitos), formatado.length);
      try {
        el.campoCep.setSelectionRange(posicao, posicao);
      } catch (erro) {
        // Alguns tipos de campo não aceitam seleção
      }
    }
    el.limpar.hidden = digitos === "";
    el.campoCep.removeAttribute("aria-invalid");
    // Mudar o CEP tira o erro da tela (o endereço encontrado continua)
    if (estado.buscaCep.tipo === "erro") {
      estado.buscaCep = { tipo: "ocioso" };
      desenharCep();
    }
    habilitar(el.buscarCep, Cep.valido(digitos) && estado.buscaCep.tipo !== "carregando");
    salvarCampos();
  }

  el.campoCep.addEventListener("input", (evento) => {
    const valor = el.campoCep.value;
    const cursor = el.campoCep.selectionStart ?? valor.length;
    let digitos = Cep.limpar(valor);
    let antes = Cep.limpar(valor.slice(0, cursor)).length;
    // Apagar só o hífen não mudaria nada: apaga o algarismo vizinho, como a pessoa espera
    if (digitos === estado.cep && valor !== valorAnterior) {
      if (evento.inputType === "deleteContentBackward" && antes > 0) {
        digitos = digitos.slice(0, antes - 1) + digitos.slice(antes);
        antes -= 1;
      } else if (evento.inputType === "deleteContentForward" && antes < digitos.length) {
        digitos = digitos.slice(0, antes) + digitos.slice(antes + 1);
      }
    }
    definirCep(digitos, Math.min(antes, digitos.length));
    // Com os 8 algarismos a busca já começa (o app espera o botão ou a tecla de busca)
    if (Cep.valido(digitos) && digitos !== ultimoCepBuscado) buscarCep();
  });

  el.limpar.addEventListener("click", () => {
    definirCep("");
    el.campoCep.focus();
  });

  el.formCep.addEventListener("submit", (evento) => {
    evento.preventDefault();
    buscarCep();
  });

  async function buscarCep() {
    if (!Cep.valido(estado.cep)) {
      estado.buscaCep = { tipo: "erro", erro: "CEP_INCOMPLETO" };
      desenharCep();
      el.campoCep.setAttribute("aria-invalid", "true");
      anunciarErro("CEP_INCOMPLETO");
      return;
    }
    const consulta = estado.cep;
    if (estado.buscaCep.tipo === "carregando" && estado.buscaCep.cep === consulta) return;
    const minha = ++sequenciaCep;
    ultimoCepBuscado = consulta;
    estado.buscaCep = { tipo: "carregando", cep: consulta };
    desenharCep();

    const resultado = await repositorio.buscarPorCep(consulta);
    // Outra busca começou enquanto esta esperava: vale a mais nova
    if (minha !== sequenciaCep) return;
    if (resultado.ok) {
      estado.buscaCep = { tipo: "sucesso", endereco: resultado.valor, instante: Date.now() };
      anunciar(`Endereço encontrado: ${Endereco.textoCompleto(resultado.valor)}.`);
    } else {
      estado.buscaCep = { tipo: "erro", erro: resultado.erro };
      anunciarErro(resultado.erro);
    }
    desenharCep();
  }

  function desenharCep() {
    const busca = estado.buscaCep;
    const ocupado = busca.tipo === "carregando";
    el.buscarCep.textContent = ocupado ? "Buscando…" : "Buscar endereço";
    habilitar(el.buscarCep, Cep.valido(estado.cep) && !ocupado);
    el.resultadoCep.setAttribute("aria-busy", String(ocupado));
    if (busca.tipo === "sucesso") {
      substituir(
        el.resultadoCep,
        criar("p", "result-label cep-encontrado", "Endereço encontrado"),
        cartaoEndereco(busca.endereco, true, busca.instante),
      );
    } else if (busca.tipo === "erro") {
      substituir(el.resultadoCep, cartaoErro(busca.erro, () => buscarCep()));
    } else if (ocupado) {
      substituir(el.resultadoCep, carregando("Buscando o endereço no ViaCEP…"));
    } else {
      substituir(el.resultadoCep, dicaCep.cloneNode(true));
    }
  }

  // ---------- Busca por rua (FormularioEndereco.kt) ----------

  function limparErroRua() {
    el.cidade.removeAttribute("aria-invalid");
    el.logradouro.removeAttribute("aria-invalid");
    if (estado.buscaRua.tipo === "erro") {
      estado.buscaRua = { tipo: "ocioso" };
      desenharRua();
    }
  }

  el.uf.addEventListener("change", () => {
    estado.uf = L.estadoPorSigla(el.uf.value) ? el.uf.value : "";
    salvarCampos();
    atualizarFormularioRua();
  });

  el.cidade.addEventListener("input", () => {
    estado.cidade = el.cidade.value;
    salvarCampos();
    limparErroRua();
    atualizarFormularioRua();
  });

  el.logradouro.addEventListener("input", () => {
    estado.logradouro = el.logradouro.value;
    salvarCampos();
    limparErroRua();
    atualizarFormularioRua();
  });

  // Enter na cidade passa para a rua, como o "Próximo" do teclado no app
  el.cidade.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      el.logradouro.focus();
    }
  });

  el.formRua.addEventListener("submit", (evento) => {
    evento.preventDefault();
    buscarRua();
  });

  async function buscarRua() {
    if (estado.buscaRua.tipo === "carregando") return;
    if (!ValidacaoEndereco.podeBuscar(estado.cidade, estado.logradouro)) {
      estado.buscaRua = { tipo: "erro", erro: "ENDERECO_INCOMPLETO" };
      desenharRua();
      if (!ValidacaoEndereco.textoSuficiente(estado.cidade)) el.cidade.setAttribute("aria-invalid", "true");
      if (!ValidacaoEndereco.textoSuficiente(estado.logradouro)) el.logradouro.setAttribute("aria-invalid", "true");
      anunciarErro("ENDERECO_INCOMPLETO");
      return;
    }
    const minha = ++sequenciaRua;
    estado.buscaRua = { tipo: "carregando", concluidos: 0, total: 0 };
    desenharRua();

    const resultado = await repositorio.buscarPorEndereco(
      estado.uf || null,
      estado.cidade,
      estado.logradouro,
      (concluidos, total) => {
        if (minha !== sequenciaRua) return;
        estado.buscaRua = { tipo: "carregando", concluidos, total };
        desenharProgresso();
      },
    );
    if (minha !== sequenciaRua) return;
    if (resultado.ok) {
      estado.buscaRua = { tipo: "sucesso", dados: resultado.valor, instante: Date.now() };
      anunciar(resumoTexto(resultado.valor).join(" "));
    } else {
      estado.buscaRua = { tipo: "erro", erro: resultado.erro };
      anunciarErro(resultado.erro);
    }
    desenharRua();
    // Ao terminar, mostra o resultado (que fica abaixo do formulário no celular)
    const caixa = el.resultadoRua.getBoundingClientRect();
    if (caixa.top > window.innerHeight || caixa.bottom < 0) el.resultadoRua.scrollIntoView({ block: "nearest" });
  }

  function resumoTexto(dados) {
    const total = dados.enderecos.length;
    const linhas = [total === 1 ? "1 resultado encontrado." : `${total} resultados encontrados.`];
    const semResposta = dados.estadosSemResposta;
    if (semResposta === 1) linhas.push("1 estado não respondeu; a lista pode estar incompleta.");
    else if (semResposta > 1) linhas.push(`${semResposta} estados não responderam; a lista pode estar incompleta.`);
    return linhas;
  }

  function atualizarFormularioRua() {
    const todosEstados = estado.uf === "";
    const ocupado = estado.buscaRua.tipo === "carregando";
    el.instrucaoRua.textContent = todosEstados
      ? "Digite a cidade e a rua para buscar em todos os estados."
      : "Preencha o estado, a cidade e o nome da rua.";
    if (ocupado) el.buscarRua.textContent = todosEstados ? `Buscando em ${L.ESTADOS.length} estados…` : "Buscando…";
    else el.buscarRua.textContent = todosEstados ? "Buscar em todos os estados" : "Buscar CEPs";
    habilitar(el.buscarRua, ValidacaoEndereco.podeBuscar(estado.cidade, estado.logradouro) && !ocupado);
  }

  function desenharProgresso() {
    const busca = estado.buscaRua;
    const visivel = busca.tipo === "carregando" && busca.total > 1;
    el.progresso.hidden = !visivel;
    if (!visivel) return;
    el.progressoBarra.max = busca.total;
    el.progressoBarra.value = busca.concluidos;
    el.progressoTexto.textContent = `Consultando estados: ${busca.concluidos} de ${busca.total}`;
  }

  function desenharRua() {
    const busca = estado.buscaRua;
    atualizarFormularioRua();
    desenharProgresso();
    el.resultadoRua.setAttribute("aria-busy", String(busca.tipo === "carregando"));

    if (busca.tipo === "sucesso") {
      const { dados } = busca;
      const resumo = criar("div", "cep-resumo");
      const [titulo, ...avisos] = resumoTexto(dados);
      resumo.append(criar("p", "cep-resumo-titulo", titulo.replace(/\.$/, "")));
      for (const aviso of avisos) resumo.append(criar("p", "cep-resumo-alerta", aviso));
      if (dados.limiteAtingido) {
        resumo.append(
          criar(
            "p",
            "cep-resumo-nota",
            "A ViaCEP mostra no máximo 50 endereços por estado. Digite o nome da rua mais completo para refinar.",
          ),
        );
      }
      resumo.append(criar("p", "cep-fonte", fonte(busca.instante)));
      substituir(el.resultadoRua, resumo);
      el.lista.replaceChildren(...dados.enderecos.map((endereco) => cartaoEndereco(endereco, false)));
      el.lista.hidden = false;
      return;
    }

    el.lista.hidden = true;
    el.lista.replaceChildren();
    if (busca.tipo === "erro") {
      substituir(el.resultadoRua, cartaoErro(busca.erro, () => buscarRua()));
    } else if (busca.tipo === "carregando") {
      substituir(el.resultadoRua, carregando("Buscando os endereços no ViaCEP…"));
    } else {
      substituir(el.resultadoRua, dicaRua.cloneNode(true));
    }
  }

  // ---------- Início ----------

  carregarCampos();
  definirCep(estado.cep);
  el.uf.value = estado.uf;
  el.cidade.value = estado.cidade;
  el.logradouro.value = estado.logradouro;
  mostrarAba(estado.aba);
  desenharCep();
  desenharRua();
})();
