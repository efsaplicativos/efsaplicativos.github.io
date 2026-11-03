"use strict";
/*
 * Interface do conversor de medidas (a lógica está em conversor-de-medidas-logica.js).
 * Mesmo comportamento de ui/tools/medidas/MedidasScreen.kt da Calculadora Multifunção:
 * guarda a última grandeza e o par de unidades escolhido em cada uma.
 */
(() => {
  const form = document.querySelector("#medidas");
  if (!form) return;

  const M = LogicaMedidas;
  const CHAVE = "efs-conversor-de-medidas-preferencias";

  const categoria = form.querySelector("#categoria");
  const valor = form.querySelector("#valor");
  const de = form.querySelector("#de");
  const para = form.querySelector("#para");
  const inverter = form.querySelector("#inverter");
  const nota = form.querySelector("#nota-categoria");
  const resultado = document.querySelector("#resultado");
  const todas = document.querySelector("#todas");
  const tabela = todas.querySelector("tbody");

  /** { categoria, pares: { comprimento: ["m", "foot"], ... } } */
  let preferencias = { categoria: M.CATEGORIAS[0].id, pares: {} };

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (!salvo || typeof salvo !== "object") return;
      if (M.dadosCategoria(salvo.categoria)) preferencias.categoria = salvo.categoria;
      if (salvo.pares && typeof salvo.pares === "object") {
        for (const [cat, par] of Object.entries(salvo.pares)) {
          const valido =
            M.dadosCategoria(cat) &&
            Array.isArray(par) &&
            par.length === 2 &&
            par.every((id) => M.unidade(id)?.categoria === cat);
          if (valido) preferencias.pares[cat] = par;
        }
      }
    } catch (erro) {
      // localStorage bloqueado ou JSON inválido: começa com os padrões
    }
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(preferencias));
    } catch (erro) {
      // sem armazenamento, só não lembra na próxima visita
    }
  }

  const rotulo = (u) => `${u.nome} (${u.simbolo})`;

  function opcoes(select, lista, selecionado) {
    select.replaceChildren(
      ...lista.map((item) => {
        const opcao = document.createElement("option");
        opcao.value = item.id;
        opcao.textContent = item.rotulo;
        opcao.selected = item.id === selecionado;
        return opcao;
      }),
    );
  }

  function montarCategoria() {
    const cat = M.dadosCategoria(categoria.value);
    const unidades = M.daCategoria(cat.id).map((u) => ({ id: u.id, rotulo: rotulo(u) }));
    const [idDe, idPara] = preferencias.pares[cat.id] || cat.par;
    opcoes(de, unidades, idDe);
    opcoes(para, unidades, idPara);
    nota.textContent = cat.nota || "";
    nota.hidden = !cat.nota;
  }

  function guardarPar() {
    preferencias.pares[categoria.value] = [de.value, para.value];
    salvar();
  }

  function linha(rotuloTexto, valorTexto) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotuloTexto;
    dd.textContent = valorTexto;
    div.append(dt, dd);
    return div;
  }

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
    todas.hidden = true;
  }

  function calcular() {
    const v = M.ler(valor.value);
    const vazio = valor.value.trim() === "";
    valor.setAttribute("aria-invalid", String(!vazio && v === null));
    if (v === null) {
      mensagem(vazio ? "Digite um valor para converter." : "Digite um número válido, como 1,5 ou 2e-3.", !vazio);
      return;
    }
    const origem = M.unidade(de.value);
    const destino = M.unidade(para.value);
    const convertido = M.converter(v, origem.id, destino.id);

    const rotuloResultado = document.createElement("div");
    rotuloResultado.className = "result-label";
    rotuloResultado.textContent = `${M.inteligente(v)} ${origem.simbolo} =`;
    const valorResultado = document.createElement("div");
    valorResultado.className = "result-value";
    valorResultado.textContent = `${M.inteligente(convertido)} ${destino.simbolo}`;
    const apoio = document.createElement("p");
    apoio.className = "medidas-apoio";
    apoio.textContent = destino.nome;
    const lista = document.createElement("dl");
    lista.className = "result-list";
    lista.append(
      linha(`1 ${origem.simbolo}`, `${M.inteligente(M.converter(1, origem.id, destino.id))} ${destino.simbolo}`),
      linha(`1 ${destino.simbolo}`, `${M.inteligente(M.converter(1, destino.id, origem.id))} ${origem.simbolo}`),
    );
    resultado.replaceChildren(rotuloResultado, valorResultado, apoio, lista);

    const linhas = M.daCategoria(categoria.value).map((u) => {
      const tr = document.createElement("tr");
      if (u.id === origem.id || u.id === destino.id) tr.className = "current";
      const nome = document.createElement("td");
      nome.textContent = u.nome;
      const celula = document.createElement("td");
      celula.textContent = `${M.inteligente(M.converter(v, origem.id, u.id))} ${u.simbolo}`;
      tr.append(nome, celula);
      return tr;
    });
    tabela.replaceChildren(...linhas);
    todas.hidden = false;
  }

  carregar();
  opcoes(
    categoria,
    M.CATEGORIAS.map((c) => ({ id: c.id, rotulo: c.nome })),
    preferencias.categoria,
  );
  montarCategoria();

  categoria.addEventListener("change", () => {
    preferencias.categoria = categoria.value;
    salvar();
    montarCategoria();
    calcular();
  });
  for (const select of [de, para]) {
    select.addEventListener("change", () => {
      guardarPar();
      calcular();
    });
  }
  inverter.addEventListener("click", () => {
    const antigo = de.value;
    de.value = para.value;
    para.value = antigo;
    guardarPar();
    calcular();
  });
  valor.addEventListener("input", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());
  calcular();
})();
