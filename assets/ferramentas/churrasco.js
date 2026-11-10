"use strict";
/* Interface do churrasco. Regras em churrasco-logica.js. */
(() => {
  const form = document.querySelector("#churrasco");
  if (!form || typeof LogicaChurrasco !== "object") return;
  const C = LogicaChurrasco;

  const campos = {
    adultos: form.querySelector("#adultos"),
    criancas: form.querySelector("#criancas"),
    perfil: form.querySelector("#perfil"),
  };
  const resultado = document.querySelector("#resultado");
  const numero = (valor, casas = 2) => Numeros.numero(valor, casas, 0);
  const gramas = (valor) => `${numero(valor, 0)} g`;

  function ler(campo) {
    const valor = Numeros.ler(campo.value);
    campo.setAttribute("aria-invalid", String(campo.value.trim() !== "" && valor === null));
    return valor;
  }

  function mensagem(texto) {
    const p = document.createElement("p");
    p.className = "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  function atualizar() {
    const conta = C.quantidades({ adultos: ler(campos.adultos) ?? 0, criancas: ler(campos.criancas) ?? 0, perfil: campos.perfil.value });
    if (conta.incompleto) return mensagem("Informe quantos adultos e crianças vão ao churrasco.");

    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "Carne para o churrasco";
    const valor = document.createElement("div");
    valor.className = "result-value";
    valor.textContent = `${numero(conta.carneKg)} kg`;
    const lista = document.createElement("dl");
    lista.className = "result-list";
    for (const [nome, texto] of [
      ["Pessoas", `${conta.pessoas} (${conta.adultos} adultos e ${conta.criancas} crianças)`],
      ["Por pessoa", gramas(conta.porPessoa)],
      ["Acompanhamentos", gramas(conta.acompanhamento)],
      ["Bebida", `${numero(conta.bebidaLitros)} L`],
      ["Carvão", `${numero(conta.carvao / 1000)} kg`],
      ["Sal grosso", gramas(conta.sal)],
    ]) {
      const item = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = nome;
      dd.textContent = texto;
      item.append(dt, dd);
      lista.append(item);
    }
    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent = `Perfil ${C.PERFIS[conta.perfil].nome}: ${gramas(C.PERFIS[conta.perfil].adulto)} de carne por adulto e ${gramas(C.PERFIS[conta.perfil].crianca)} por criança. O carvão é estimado em metade do peso da carne e o sal, em 10 g por quilo.`;
    resultado.replaceChildren(rotulo, valor, lista, nota);
  }

  const EXEMPLOS = { familia: { adultos: "8", criancas: "4", perfil: "classico" } };

  for (const botao of document.querySelectorAll("[data-exemplo]")) {
    botao.addEventListener("click", () => {
      const exemplo = EXEMPLOS[botao.dataset.exemplo];
      if (!exemplo) return;
      for (const [campo, valor] of Object.entries(exemplo)) campos[campo].value = valor;
      atualizar();
      form.scrollIntoView({ block: "start" });
    });
  }

  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizar();
  });
  atualizar();
})();
