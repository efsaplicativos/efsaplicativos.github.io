"use strict";
// Mesmos casos de app/src/test/.../core/datas/DateCalculationsTest.kt, mais conferências do
// calendário (conversão de/para dias comparada com Date.UTC).
const assert = require("node:assert/strict");
const D = require("../../assets/ferramentas/calculadora-de-datas-logica.js");

const d = (a, m, dia) => {
  const n = D.criar(a, m, dia);
  assert.notEqual(n, null, `data inválida ${a}-${m}-${dia}`);
  return n;
};

// calendário: ida e volta e comparação com Date.UTC (que não depende do fuso)
assert.equal(d(1970, 1, 1), 0);
for (let n = -800000; n <= 800000; n += 997) {
  const p = D.partes(n);
  assert.equal(D.criar(p.ano, p.mes, p.dia), n);
  const utc = new Date(n * 86400000);
  if (p.ano > 0) assert.deepEqual(p, { ano: utc.getUTCFullYear(), mes: utc.getUTCMonth() + 1, dia: utc.getUTCDate() });
}
assert.equal(D.criar(2026, 2, 29), null);
assert.equal(D.criar(2024, 2, 29), d(2024, 2, 29));
assert.equal(D.criar(2026, 13, 1), null);
assert.equal(D.lerISO("2026-01-01"), d(2026, 1, 1));
assert.equal(D.lerISO("2026-02-30"), null);
assert.equal(D.lerISO(""), null);
assert.equal(D.paraISO(d(2026, 1, 5)), "2026-01-05");
assert.equal(D.hoje(new Date(2026, 0, 1, 0, 30)), d(2026, 1, 1)); // meia-noite local não volta um dia
assert.equal(D.diaDaSemana(d(2026, 10, 23)), 5); // sexta-feira
assert.equal(D.nomeDiaSemana(d(2026, 11, 3)), "Terça-feira");
assert.equal(D.formatarLonga(d(2026, 12, 31)), "31 de dezembro de 2026");
assert.equal(D.formatarLonga(d(2026, 3, 1)), "1º de março de 2026");
assert.equal(D.formatarCurta(d(2026, 3, 1)), "01/03/2026");

// datas iguais não são futuro
let dif = D.diferenca(d(2026, 10, 23), d(2026, 10, 23));
assert.equal(dif.direcao, "igual");
assert.equal(dif.totalDias, 0);

// diferença simples e direção
dif = D.diferenca(d(2026, 3, 15), d(2024, 1, 10));
assert.equal(dif.direcao, "passado");
assert.equal(dif.anos, 2);
assert.equal(dif.meses, 2);
assert.equal(dif.dias, 5);
assert.equal(dif.totalDias, 795);
assert.equal(dif.semanas, 113);
assert.equal(dif.diasRestantesSemana, 4);
assert.equal(dif.totalMeses, 26);
assert.equal(dif.totalHoras, 795 * 24);
assert.equal(D.diferenca(d(2024, 1, 10), d(2026, 3, 15)).direcao, "futuro");

// incluir a data final soma um dia
dif = D.diferenca(d(2026, 1, 1), d(2026, 1, 1), true);
assert.equal(dif.totalDias, 1);
assert.equal(dif.dias, 1);
const ano = D.diferenca(d(2026, 1, 1), d(2026, 12, 31), true);
assert.equal(ano.anos, 1);
assert.equal(ano.totalDias, 365);

// virada de ano e ano bissexto
assert.equal(D.diferenca(d(2025, 12, 31), d(2026, 1, 1)).totalDias, 1);
assert.equal(D.diferenca(d(2024, 1, 1), d(2025, 1, 1)).totalDias, 366);
const bissexto = D.diferenca(d(2024, 2, 29), d(2025, 2, 28));
assert.equal(bissexto.anos, 0);
assert.equal(bissexto.meses, 11);
assert.equal(bissexto.dias, 30);

// dias úteis e fins de semana
dif = D.diferenca(d(2026, 10, 19), d(2026, 10, 26));
assert.equal(dif.diasUteis, 5);
assert.equal(dif.diasFimDeSemana, 2);
assert.equal(D.diferenca(d(2026, 10, 19), d(2026, 10, 26), true).diasUteis, 6);
assert.equal(D.diasUteisEntre(d(2026, 10, 24), d(2026, 10, 26)), 0);

// somar e subtrair
assert.equal(D.somar(d(2026, 1, 31), 1, "meses"), d(2026, 2, 28));
assert.equal(D.somar(d(2024, 1, 31), 1, "meses"), d(2024, 2, 29));
assert.equal(D.somar(d(2024, 2, 29), 1, "anos"), d(2025, 2, 28));
assert.equal(D.somar(d(2026, 1, 1), -7, "dias"), d(2025, 12, 25));
assert.equal(D.somar(d(2026, 1, 1), 2, "semanas"), d(2026, 1, 15));
assert.equal(D.somar(d(2026, 3, 31), -1, "meses"), d(2026, 2, 28));
assert.equal(D.somar(d(2026, 1, 15), -13, "meses"), d(2024, 12, 15));

// somar dias úteis
const sexta = d(2026, 10, 23);
assert.equal(D.somarDiasUteis(sexta, 1), d(2026, 10, 26));
assert.equal(D.somarDiasUteis(sexta, 5), d(2026, 10, 30));
const sabado = d(2026, 10, 24);
assert.equal(D.somarDiasUteis(sabado, 5), d(2026, 10, 30));
assert.equal(D.somarDiasUteis(sabado, 6), d(2026, 11, 2));
assert.equal(D.somarDiasUteis(sexta, -1), d(2026, 10, 22));
assert.equal(D.somarDiasUteis(d(2026, 10, 26), -6), d(2026, 10, 16));
assert.equal(D.somarDiasUteis(sexta, 0), sexta);
assert.equal(D.somar(sexta, 1, "dias", true), d(2026, 10, 26));
// conferência com contagem dia a dia em vários pontos de partida
let inicio = d(2026, 1, 1);
for (let k = 0; k < 14; k++) {
  for (let n = 1; n <= 23; n++) {
    const resultado = D.somarDiasUteis(inicio, n);
    assert.ok(D.diaUtil(resultado));
    assert.equal(D.diasUteisEntre(inicio + 1, resultado + 1), n);
  }
  inicio++;
}

// informações da data
const info = D.informacoes(d(2026, 12, 31), d(2026, 12, 1));
assert.equal(info.diaDoAno, 365);
assert.equal(info.semanaISO, 53);
assert.equal(info.anoDaSemanaISO, 2026);
assert.equal(info.trimestre, 4);
assert.equal(info.bissexto, false);
assert.equal(info.diasRestantesNoAno, 0);
assert.equal(info.diasDesdeHoje, 30);
const jan = D.informacoes(d(2027, 1, 1), d(2027, 1, 1));
assert.equal(jan.semanaISO, 53); // 01/01/2027 ainda pertence à semana 53 de 2026
assert.equal(jan.anoDaSemanaISO, 2026);
assert.equal(D.informacoes(d(2028, 2, 29), d(2028, 1, 1)).bissexto, true);
assert.deepEqual(D.semanaISO(d(2026, 1, 1)), { semana: 1, ano: 2026 });
assert.deepEqual(D.semanaISO(d(2024, 12, 30)), { semana: 1, ano: 2025 });

console.log("calculadora-de-datas: todos os testes passaram");
