"use strict";
/*
 * Interface da calculadora de consumo de água (a lógica está em consumo-de-agua-logica.js).
 * Mesmos campos de ui/tools/agua/AguaScreen.kt da Calculadora Multifunção: peso em kg ou lb,
 * atividade física, clima, gestação ou amamentação, tamanho do copo e horários do dia.
 * O peso não é guardado; só a unidade, o copo e os horários ficam no navegador.
 */
(() => {
  const raiz = document.querySelector(".agua");
  if (!raiz) return;

  const A = LogicaAgua;
  const CHAVE = "efs-consumo-de-agua-preferencias";
  const PESO_MIN_KG = 2;
  const PESO_MAX_KG = 650;
  const MINUTOS_MAX = 24 * 60;

  const form = raiz.querySelector("#form-agua");
  const peso = raiz.querySelector("#peso");
  const pesoUnidade = raiz.querySelector("#peso-unidade");
  const pesoDica = raiz.querySelector("#peso-dica");
  const exercicio = raiz.querySelector("#exercicio");
  const acordar = raiz.querySelector("#acordar");
  const dormir = raiz.querySelector("#dormir");
  const resultado = raiz.querySelector("#resultado-agua");
  const cronograma = raiz.querySelector("#cronograma");
  const listaHorarios = raiz.querySelector("#cronograma-lista");

  const estado = { unidade: "kg", clima: "ameno", condicao: "nenhuma", copo: 250 };

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
    cronograma.hidden = true;
  }

  function alternar(atributo, valor) {
    for (const botao of form.querySelectorAll(`[data-${atributo}]`)) {
      const ativo = botao.dataset[atributo] === String(valor);
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }
  }

  const litros = (ml) => `${Numeros.numero(ml / 1000, 2, 2)} L`;
  const mililitros = (ml) => `${Numeros.numero(Math.round(ml), 0)} ml`;

  // --- Preferências -------------------------------------------------------------------------

  function salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({ unidade: estado.unidade, copo: estado.copo, acordar: acordar.value, dormir: dormir.value }),
      );
    } catch (erro) {
      // sem armazenamento, só não lembra na próxima visita
    }
  }

  function carregar() {
    let dados = null;
    try {
      dados = JSON.parse(localStorage.getItem(CHAVE) || "null");
    } catch (erro) {
      dados = null;
    }
    if (!dados || typeof dados !== "object") return;
    if (dados.unidade === "kg" || dados.unidade === "lb") estado.unidade = dados.unidade;
    if (A.TAMANHOS_COPO.includes(dados.copo)) estado.copo = dados.copo;
    if (A.lerHora(dados.acordar) !== null) acordar.value = dados.acordar;
    if (A.lerHora(dados.dormir) !== null) dormir.value = dados.dormir;
  }

  // --- Cálculo ------------------------------------------------------------------------------

  function lerPesoKg() {
    const valor = Numeros.ler(peso.value);
    if (valor === null) {
      peso.setAttribute("aria-invalid", String(peso.value.trim() !== ""));
      return { kg: null, invalido: peso.value.trim() !== "" };
    }
    const kg = estado.unidade === "kg" ? valor : A.librasParaKg(valor);
    const invalido = !(kg >= PESO_MIN_KG && kg <= PESO_MAX_KG);
    peso.setAttribute("aria-invalid", String(invalido));
    return { kg: invalido ? null : kg, invalido };
  }

  function lerExercicio() {
    const texto = exercicio.value.trim();
    if (texto === "") {
      exercicio.setAttribute("aria-invalid", "false");
      return 0;
    }
    const valor = Numeros.ler(texto);
    const valido = valor !== null && valor >= 0 && valor <= MINUTOS_MAX;
    exercicio.setAttribute("aria-invalid", String(!valido));
    return valido ? valor : null;
  }

  function calcular() {
    const { kg, invalido } = lerPesoKg();
    const minutos = lerExercicio();
    const horaAcordar = A.lerHora(acordar.value);
    const horaDormir = A.lerHora(dormir.value);
    acordar.setAttribute("aria-invalid", String(horaAcordar === null));
    dormir.setAttribute("aria-invalid", String(horaDormir === null));

    if (invalido) {
      mensagem(
        estado.unidade === "kg" ? "Informe um peso entre 2 e 650 kg." : "Informe um peso entre 5 e 1.433 lb.",
        true,
      );
      return;
    }
    if (kg === null) {
      mensagem("Informe o seu peso.");
      return;
    }
    if (minutos === null) {
      mensagem("Informe os minutos de atividade física, de 0 a 1.440.", true);
      return;
    }

    const r = A.calcular(kg, { minutosExercicio: minutos, clima: estado.clima, condicao: estado.condicao });
    const copos = A.copos(r.totalMl, estado.copo);

    const detalhes = [linha("Base (35 ml por kg)", mililitros(r.baseMl))];
    if (r.exercicioMl > 0) detalhes.push(linha("Atividade física", `+ ${mililitros(r.exercicioMl)}`));
    if (r.climaMl > 0) detalhes.push(linha("Clima", `+ ${mililitros(r.climaMl)}`));
    if (r.condicaoMl > 0) detalhes.push(linha(A.CONDICOES[estado.condicao].nome, `+ ${mililitros(r.condicaoMl)}`));
    detalhes.push(linha("Total", mililitros(r.totalMl)));

    const partes = [
      elemento("div", "result-label", "Estimativa diária"),
      elemento("div", "result-value", litros(r.totalMl)),
      elemento("span", "level level-ok", `${copos} ${copos === 1 ? "copo" : "copos"} de ${estado.copo} ml`),
      lista(
        linha("Em mililitros", mililitros(r.totalMl)),
        linha("Faixa usual (30 a 40 ml/kg)", `${litros(r.faixaMinMl)} a ${litros(r.faixaMaxMl)}`),
      ),
      elemento("h3", "agua-subtitulo", "Como chegamos a esse valor"),
      lista(...detalhes),
    ];
    if (estado.unidade === "lb") {
      partes.push(elemento("p", "hint agua-nota", `Peso considerado: ${Numeros.numero(kg, 1)} kg.`));
    }
    resultado.replaceChildren(...partes);

    if (horaAcordar === null || horaDormir === null || horaAcordar === horaDormir) {
      cronograma.hidden = true;
      return;
    }
    const itens = A.horarios(horaAcordar, horaDormir, copos).map((minuto, i) => {
      const item = elemento("li", "agua-copo");
      item.append(elemento("span", "agua-gota"), elemento("span", "", `${i + 1} · ${A.textoHora(minuto)}`));
      item.querySelector(".agua-gota").setAttribute("aria-hidden", "true");
      item.setAttribute("aria-label", `Copo ${i + 1} às ${A.textoHora(minuto)}`);
      return item;
    });
    listaHorarios.replaceChildren(...itens);
    cronograma.hidden = false;
  }

  // --- Eventos ------------------------------------------------------------------------------

  function escolher(atributo, chave, converter = (v) => v) {
    for (const botao of form.querySelectorAll(`[data-${atributo}]`)) {
      botao.addEventListener("click", () => {
        estado[chave] = converter(botao.dataset[atributo]);
        alternar(atributo, estado[chave]);
        if (chave === "unidade") atualizarUnidade();
        if (chave === "unidade" || chave === "copo") salvar();
        calcular();
      });
    }
  }

  function atualizarUnidade() {
    pesoUnidade.textContent = estado.unidade;
    pesoDica.textContent = estado.unidade === "kg" ? "Entre 2 e 650 kg." : "Entre 5 e 1.433 lb.";
    peso.placeholder = estado.unidade === "kg" ? "Ex.: 70" : "Ex.: 155";
  }

  escolher("unidade", "unidade");
  escolher("clima", "clima");
  escolher("condicao", "condicao");
  escolher("copo", "copo", Number);

  form.addEventListener("input", calcular);
  for (const campo of [acordar, dormir]) campo.addEventListener("change", salvar);
  form.addEventListener("submit", (evento) => evento.preventDefault());

  carregar();
  alternar("unidade", estado.unidade);
  alternar("copo", estado.copo);
  atualizarUnidade();
  calcular();
})();
