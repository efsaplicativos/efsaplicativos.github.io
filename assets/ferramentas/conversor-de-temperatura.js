"use strict";
/*
 * Interface do conversor de temperatura (a lógica está em conversor-de-temperatura-logica.js).
 * Como em ui/tools/temperatura/TemperaturaScreen.kt da Calculadora Multifunção: o campo
 * editado é a origem e os outros sete são preenchidos a partir dele.
 */
(() => {
  const form = document.querySelector("#temperatura");
  if (!form) return;

  const T = LogicaTemperatura;
  const campos = new Map([...form.querySelectorAll("[data-escala]")].map((campo) => [campo.dataset.escala, campo]));
  const resultado = document.querySelector("#resultado");

  function mensagem(texto, erro = false) {
    const p = document.createElement("p");
    p.className = erro ? "result-message error" : "result-message";
    p.textContent = texto;
    resultado.replaceChildren(p);
  }

  /** Resumo nas três escalas mais usadas, lido pelos leitores de tela. */
  function resumo(todas, aviso) {
    const rotulo = document.createElement("div");
    rotulo.className = "result-label";
    rotulo.textContent = "Equivale a";
    const valor = document.createElement("div");
    valor.className = "temperatura-equivale";
    valor.textContent = ["celsius", "fahrenheit", "kelvin"]
      .map((id) => `${T.textoCampo(todas[id])} ${T.escala(id).simbolo}`)
      .join(" = ");
    const partes = [rotulo, valor];
    if (aviso) {
      const p = document.createElement("p");
      p.className = "result-message error";
      p.textContent = "Abaixo do zero absoluto (−273,15 °C = 0 K). Essa temperatura não existe fisicamente.";
      partes.push(p);
    }
    resultado.replaceChildren(...partes);
  }

  function editar(origem) {
    const campo = campos.get(origem);
    const texto = campo.value.trim();
    for (const outro of campos.values()) outro.setAttribute("aria-invalid", "false");
    if (texto === "") {
      for (const outro of campos.values()) outro.value = "";
      mensagem("Preencha qualquer campo para ver a conversão.");
      return;
    }
    const valor = Numeros.ler(texto);
    if (valor === null) {
      // Sinal de menos sozinho é texto incompleto: os outros campos ficam como estão.
      if (texto === "-" || texto === "−") return;
      campo.setAttribute("aria-invalid", "true");
      mensagem("Digite um número, como 36,6 ou -40.", true);
      return;
    }
    const todas = T.converterTodas(valor, origem);
    for (const [id, outro] of campos) if (id !== origem) outro.value = T.textoCampo(todas[id]);
    resumo(todas, T.abaixoDoZeroAbsoluto(valor, origem));
  }

  for (const [id, campo] of campos) campo.addEventListener("input", () => editar(id));

  for (const botao of form.querySelectorAll("[data-celsius]")) {
    botao.addEventListener("click", () => {
      campos.get("celsius").value = T.textoCampo(Number(botao.dataset.celsius));
      editar("celsius");
    });
  }

  form.querySelector("#limpar").addEventListener("click", () => {
    campos.get("celsius").value = "";
    editar("celsius");
    campos.get("celsius").focus();
  });
  form.addEventListener("submit", (evento) => evento.preventDefault());
})();
