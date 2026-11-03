"use strict";
/*
 * Interface da calculadora de idade (a lógica está em calculadora-de-idade-logica.js, que usa
 * calculadora-de-datas-logica.js). Mesmo conteúdo de ui/tools/idade da Calculadora
 * Multifunção: idade em anos, meses e dias, totais, próximo aniversário e curiosidades.
 * A data de nascimento não é guardada: é dado pessoal e só vive na página.
 */
(() => {
  const raiz = document.querySelector(".idade");
  if (!raiz) return;

  const D = LogicaDatas;
  const I = LogicaIdade;
  const inteiro = (n) => Numeros.numero(n, 0);
  const plural = (n, um, varios) => `${inteiro(n)} ${Math.abs(n) === 1 ? um : varios}`;

  const form = raiz.querySelector("#form-idade");
  const nascimento = raiz.querySelector("#nascimento");
  const referencia = raiz.querySelector("#referencia");
  const resultado = raiz.querySelector("#resultado-idade");
  const cartaoProximo = raiz.querySelector("#proximo-aniversario");
  const conteudoProximo = raiz.querySelector("#proximo-conteudo");
  const cartaoCuriosidades = raiz.querySelector("#curiosidades");
  const conteudoCuriosidades = raiz.querySelector("#curiosidades-conteudo");

  // --- Auxiliares ---------------------------------------------------------------------------

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function linha(rotulo, valor) {
    const div = document.createElement("div");
    div.append(elemento("dt", "", rotulo), elemento("dd", "", valor));
    return div;
  }

  function lista(...linhas) {
    const dl = elemento("dl", "result-list");
    dl.append(...linhas);
    return dl;
  }

  function mensagem(texto, erro = false) {
    resultado.replaceChildren(elemento("p", erro ? "result-message error" : "result-message", texto));
    cartaoProximo.hidden = true;
    cartaoCuriosidades.hidden = true;
  }

  function lerData(campo) {
    const texto = campo.value.trim();
    const dias = D.lerISO(texto);
    const ano = dias === null ? 0 : D.partes(dias).ano;
    const valida = dias !== null && ano >= 1 && ano <= 9999;
    campo.setAttribute("aria-invalid", String((texto !== "" || campo.validity.badInput) && !valida));
    return valida ? dias : null;
  }

  function caixasPeriodo(anos, meses, dias) {
    const caixas = elemento("div", "idade-periodo");
    for (const [valor, um, varios] of [
      [anos, "ano", "anos"],
      [meses, "mês", "meses"],
      [dias, "dia", "dias"],
    ]) {
      const caixa = elemento("div", "idade-caixa");
      caixa.append(
        elemento("span", "idade-caixa-valor", inteiro(valor)),
        elemento("span", "idade-caixa-rotulo", valor === 1 ? um : varios),
      );
      caixas.append(caixa);
    }
    caixas.setAttribute("role", "group");
    caixas.setAttribute("aria-label", `${plural(anos, "ano", "anos")}, ${plural(meses, "mês", "meses")} e ${plural(dias, "dia", "dias")}`);
    return caixas;
  }

  // --- Cálculo ------------------------------------------------------------------------------

  function calcular() {
    const hoje = D.hoje();
    // Não dá para nascer depois de hoje; a referência pode ir ao futuro.
    nascimento.max = D.paraISO(Math.max(hoje, D.lerISO(referencia.value) ?? hoje));
    const n = lerData(nascimento);
    const r = lerData(referencia);
    if (n === null) {
      const invalida = nascimento.getAttribute("aria-invalid") === "true";
      mensagem(invalida ? "Use uma data de nascimento completa." : "Escolha a data de nascimento.", invalida);
      return;
    }
    if (r === null) {
      const invalida = referencia.getAttribute("aria-invalid") === "true";
      mensagem(invalida ? "Use uma data completa para o cálculo." : "Escolha a data em que a idade será calculada.", invalida);
      return;
    }
    if (n > r) {
      nascimento.setAttribute("aria-invalid", "true");
      mensagem(
        r === hoje
          ? "A data de nascimento não pode ser no futuro."
          : "A data de nascimento precisa ser anterior à data do cálculo.",
        true,
      );
      return;
    }

    const x = I.calcular(n, r);
    const noFuturo = r > hoje;
    const noPassado = r < hoje;
    const rotulo = noFuturo || noPassado ? `Idade em ${D.formatarCurta(r)}` : "Idade";

    const partes = [elemento("div", "result-label", rotulo), elemento("div", "result-value", plural(x.anos, "ano", "anos"))];
    if (x.aniversarioHoje) {
      const parabens = elemento("span", "level level-ok", r === hoje ? "Feliz aniversário! 🎉" : "Dia de aniversário! 🎉");
      partes.push(parabens);
    }
    partes.push(
      caixasPeriodo(x.anos, x.meses, x.dias),
      elemento("h3", "idade-subtitulo", "Tempo total"),
      lista(
        linha("Meses", inteiro(x.totalMeses)),
        linha("Semanas", inteiro(x.totalSemanas)),
        linha("Dias", inteiro(x.totalDias)),
        linha("Horas (aprox.)", inteiro(x.totalHoras)),
      ),
    );
    resultado.replaceChildren(...partes);

    // Próximo aniversário
    const proximo = [
      elemento("div", "result-value idade-data", D.formatarLonga(x.proximoAniversario)),
      elemento("p", "result-message idade-semana", D.nomeDiaSemana(x.proximoAniversario)),
      lista(
        linha(noFuturo || noPassado ? `Dias a partir de ${D.formatarCurta(r)}` : "Faltam", plural(x.diasAteAniversario, "dia", "dias")),
        linha("Idade que vai fazer", plural(x.idadeNoProximo, "ano", "anos")),
      ),
    ];
    if (x.proximoAjustado) {
      proximo.push(
        elemento("p", "hint idade-nota", "Quem nasceu em 29 de fevereiro comemora em 28 de fevereiro nos anos que não são bissextos."),
      );
    }
    conteudoProximo.replaceChildren(...proximo);
    cartaoProximo.hidden = false;

    // Curiosidades
    const chines = x.signoChines;
    const linhas = [
      linha("Dia da semana em que nasceu", D.nomeDiaSemana(n)),
      linha("Signo", `${x.signo.simbolo}\u{FE0E} ${x.signo.nome}`),
      linha("Horóscopo chinês", chines.incerto ? `${chines.animal}*` : chines.animal),
    ];
    if (x.geracao) linhas.push(linha("Geração", x.geracao.nome));
    const curiosidades = [lista(...linhas)];
    if (chines.incerto) {
      curiosidades.push(
        elemento(
          "p",
          "hint idade-nota",
          "* Aproximado: o Ano-Novo Lunar cai entre 21 de janeiro e 20 de fevereiro, então quem nasceu nesse intervalo pode ser do animal do ano anterior.",
        ),
      );
    }
    conteudoCuriosidades.replaceChildren(...curiosidades);
    cartaoCuriosidades.hidden = false;
  }

  raiz.querySelector("#referencia-hoje").addEventListener("click", () => {
    referencia.value = D.paraISO(D.hoje());
    calcular();
  });
  form.addEventListener("input", calcular);
  form.addEventListener("change", calcular);
  form.addEventListener("submit", (evento) => evento.preventDefault());

  referencia.value = D.paraISO(D.hoje());
  calcular();
})();
