"use strict";
// Casos de CalculatorEngineTest.kt (calculadora financeira RPN da EFS Aplicativos).
// Rode: node _fonte/testes/calculadora-financeira-rpn.test.js
const assert = require("node:assert/strict");
const R = require("../../assets/ferramentas/calculadora-financeira-rpn-logica.js");

const K = R.Tecla;

/** Nomes usados nos roteiros: rótulos das teclas e das funções f/g (como no teste do app). */
const NOMES = new Map(R.TECLAS.map((k) => [k.rotulo, [k]]));
for (const [nome, tecla] of Object.entries({
  yx: K.YX, f: K.F, g: K.G, "√x": K.YX, ex: K.RECIP, LN: K.PCT_T, FRAC: K.DELTA_PCT, INTG: K.PCT,
  "n!": K.D3, "x²": K.MUL, "◄": K.DIV, LSTx: K.ENTER, BEG: K.D7, "12×": K.N, "12÷": K.I, CFo: K.PV,
  CFj: K.PMT, Nj: K.FV, NPV: K.PV, IRR: K.FV, AMORT: K.N, INT: K.I, RND: K.PMT, DATE: K.CHS,
  "ΔDYS": K.EEX, "M.DY": K.D5, media: K.D0, s: K.DOT, media_w: K.D6, y_estimado: K.D2, x_estimado: K.D1,
  SL: K.PCT_T, SOYD: K.DELTA_PCT, DB: K.PCT, PRICE: K.YX, YTM: K.RECIP, CLR_PREFIX: K.ENTER,
  CLR_PRGM: K.RDN, "P/R": K.RS, "x≤y": K.XY, GTO: K.RDN,
})) {
  NOMES.set(nome, [tecla]);
}

let c;

/** Digita uma sequência como "1000 CHS PV 1 i 12 n FV" (números com ponto decimal). */
function teclas(roteiro) {
  for (const token of roteiro.trim().split(/\s+/)) {
    const nomeada = NOMES.get(token);
    if (nomeada) {
      for (const k of nomeada) c.pressionar(k);
      continue;
    }
    for (const ch of token) c.pressionar(ch === "." ? K.DOT : R.teclaDoDigito(Number(ch)));
  }
}

function rodarPrograma() {
  let guarda = 0;
  while (c.executando && guarda++ < 10000) c.passo();
}

const perto = (real, esperado, delta = 1e-6) =>
  assert.ok(Math.abs(real - esperado) <= delta, `esperado ${esperado}, veio ${real}`);
const X = (esperado, delta) => perto(c.x, esperado, delta);

const testes = {
  // ---------- RPN básico
  "soma com enter"() {
    teclas("5 ENTER 3 +");
    X(8);
  },
  "pilha sobe e desce"() {
    teclas("1 ENTER 2 ENTER 3 ENTER 4 + + +");
    X(10);
  },
  "enter repete valor na pilha"() {
    teclas("3 ENTER ×");
    X(9);
  },
  "clx nao sobe a pilha"() {
    teclas("5 ENTER 7 CLx 2 +");
    X(7);
  },
  "sto nao impede elevacao da pilha"() {
    teclas("5 ENTER 3 STO 1 4 +");
    X(7);
    assert.equal(c.y, 5);
  },
  "potencia e raiz"() {
    teclas("2 ENTER 10 yx");
    X(1024);
    teclas("g √x");
    X(32);
  },
  porcentagens() {
    teclas("200 ENTER 15 %");
    X(30);
    assert.equal(c.y, 200);
    teclas("CLx 100 ENTER 120 Δ%");
    X(20);
    teclas("CLx 50 ENTER 10 %T");
    X(20);
  },
  "last x e trocas"() {
    teclas("9 ENTER 3 ÷ g LSTx");
    X(3);
    teclas("x≷y");
    X(3);
    teclas("R↓ R↓");
    X(0);
    teclas("R↓ R↓");
    X(3);
  },
  "notacao cientifica na entrada"() {
    teclas("1.5 EEX 3");
    X(1500);
    teclas("CHS");
    X(0.0015, 1e-12);
  },
  "funcoes matematicas"() {
    teclas("5 g n!");
    X(120);
    teclas("CLx 3.75 g FRAC");
    X(0.75);
    teclas("CLx 3.75 g INTG");
    X(3);
    teclas("CLx 1 g ex g LN");
    X(1);
    teclas("CLx 4 g x² 1/x");
    X(0.0625);
  },
  "backspace apaga digito"() {
    teclas("123 g ◄");
    X(12);
    teclas("g ◄ g ◄ g ◄ 7");
    X(7);
  },
  "divisao por zero mostra erro e proxima tecla limpa"() {
    teclas("1 ENTER 0 ÷");
    assert.equal(c.erro, 0);
    assert.equal(c.visor().texto, "Erro 0");
    teclas("5");
    assert.equal(c.erro, null);
    teclas("5");
    X(5);
  },
  "aritmetica nos registradores"() {
    teclas("10 STO 1 5 STO + 1 2 STO × 1 RCL 1");
    X(30);
    teclas("7 STO . 3 RCL . 3");
    X(7);
  },
  "f prefixo duplo cancela"() {
    teclas("5 f f 3");
    X(53);
  },

  // ---------- juros compostos
  "valor futuro"() {
    teclas("1000 CHS PV 1 i 12 n FV");
    X(1126.8250301319697);
  },
  pagamento() {
    teclas("100000 PV 1 i 360 n 0 FV PMT");
    X(-1028.6125969255042);
  },
  "valor presente antecipado"() {
    teclas("g BEG 100 CHS PMT 1 i 12 n 0 FV PV");
    X(1136.762824821949);
    assert.ok(c.visor().begin);
  },
  "taxa de juros"() {
    teclas("1000 CHS PV 0 PMT 12 n 1126.8250301319697 FV i");
    X(1, 1e-8);
  },
  "numero de periodos arredonda para cima"() {
    teclas("1000 PV 0 PMT 10 i 2000 CHS FV n");
    X(8);
  },
  "tecla financeira logo apos outra calcula"() {
    teclas("1000 CHS PV 1 i 12 n FV FV");
    X(1126.8250301319697);
    teclas("ENTER FV");
    X(1126.8250301319697);
    teclas("RCL FV");
    X(1126.8250301319697);
  },
  "doze vezes e doze avos"() {
    teclas("30 g 12× 12 g 12÷ RCL n");
    X(360);
    teclas("RCL i");
    X(1);
  },
  "juros sem solucao da erro 5"() {
    teclas("1000 PV 0 PMT 12 n 2000 FV i");
    assert.equal(c.erro, 5);
  },

  // ---------- fluxo de caixa
  "npv e irr"() {
    teclas("1000 CHS g CFo 500 g CFj 3 g Nj 10 i f NPV");
    X(243.42599549211099);
    teclas("f IRR");
    X(23.375192852825865, 1e-6);
  },
  "irr sem troca de sinal da erro 7"() {
    teclas("1000 g CFo 500 g CFj f IRR");
    assert.equal(c.erro, 7);
  },

  // ---------- amortização e juros simples
  "amortizacao uma parcela"() {
    teclas("50000 PV 13.25 g 12÷ 573.35 CHS PMT 0 n 1 f AMORT");
    X(-552.08);
    perto(c.y, -21.27, 1e-9);
    teclas("RCL PV");
    X(49978.73);
  },
  "amortizacao doze parcelas"() {
    teclas("50000 PV 13.25 g 12÷ 573.35 CHS PMT 0 n 12 f AMORT");
    X(-6608.89);
    perto(c.y, -271.31, 1e-9);
    teclas("RCL PV");
    X(49728.69);
    teclas("RCL n");
    X(12);
  },
  "juros simples"() {
    teclas("450 CHS PV 60 n 7 i f INT");
    X(5.25);
    teclas("+");
    X(455.25);
  },

  // ---------- calendário
  "soma dias a uma data"() {
    teclas("14.051955 ENTER 120 g DATE");
    X(11.091955);
    const d = c.visor();
    assert.equal(d.texto, "11/09/1955");
    assert.ok(d.legenda.startsWith("domingo"));
  },
  "diferenca entre datas"() {
    teclas("1.012024 ENTER 31.122024 g ΔDYS");
    X(365);
    assert.equal(c.y, 360);
  },
  "formato mes dia ano"() {
    teclas("g M.DY 5.142024 ENTER 1 g DATE");
    X(5.152024);
  },
  "data invalida da erro 8"() {
    teclas("31.022024 ENTER 1 g DATE");
    assert.equal(c.erro, 8);
  },

  // ---------- estatística
  "estatistica e regressao"() {
    teclas("2 ENTER 1 Σ+ 4 ENTER 2 Σ+ 6 ENTER 3 Σ+ 8 ENTER 4 Σ+");
    X(4);
    teclas("g media");
    X(2.5);
    perto(c.y, 5, 1e-12);
    teclas("g s");
    X(1.2909944487358056);
    teclas("5 g y_estimado");
    X(10);
    perto(c.y, 1, 1e-12);
    teclas("10 g x_estimado");
    X(5);
  },
  "media ponderada"() {
    teclas("10 ENTER 1 Σ+ 20 ENTER 3 Σ+ g media_w");
    X(17.5);
  },
  "media sem dados da erro 2"() {
    teclas("g media");
    assert.equal(c.erro, 2);
  },

  // ---------- depreciação e títulos
  depreciacao() {
    teclas("10000 PV 500 FV 5 n 200 i 1 f SL");
    X(1900);
    perto(c.y, 7600, 1e-9);
    teclas("1 f SOYD");
    X((9500 * 5) / 15);
    teclas("1 f DB");
    X(4000);
    perto(c.y, 5500, 1e-9);
    teclas("2 f DB");
    X(2400);
  },
  "preco de titulo"() {
    teclas("4.75 i 6.75 PMT 28.042004 ENTER 4.062018 f PRICE");
    X(120.37956484002271, 1e-8);
    perto(c.y, 2.692622950819672, 1e-9);
  },
  "rendimento de titulo"() {
    teclas("120.37956484002271 PV 6.75 PMT 28.042004 ENTER 4.062018 f YTM");
    X(4.75, 1e-7);
  },

  // ---------- visor
  "formato brasileiro e americano"() {
    teclas("1234.5");
    teclas("ENTER");
    assert.equal(c.visor().texto, "1.234,50");
    c.virgula = false;
    assert.equal(c.visor().texto, "1,234.50");
    teclas("f 4");
    assert.equal(c.visor().texto, "1,234.5000");
  },
  "numero grande vai para notacao cientifica"() {
    teclas("123456789 ENTER 100 ×");
    const d = c.visor();
    assert.equal(d.texto, "1,234568");
    assert.equal(d.expoente, " 10");
  },
  "arredondamento de visor"() {
    teclas("2 ENTER 3 ÷ f RND");
    X(0.67);
  },
  mantissa() {
    teclas("2 ENTER 3 ÷ f CLR_PREFIX");
    assert.equal(c.visor().texto, "6666666667");
    assert.ok(c.temMensagemTemporaria);
  },
  "formatos do visor em casos de borda"() {
    assert.equal(R.formatar(0, 2, false, true).texto, "0,00");
    assert.equal(R.formatar(-0.004, 2, false, true).texto, "0,00");
    assert.equal(R.formatar(9999999999.4, 2, false, true).texto, "9.999.999.999");
    assert.deepEqual(R.formatar(1e-12, 2, false, true), { texto: "1,000000", expoente: "-12" });
    assert.deepEqual(R.formatar(1e21, 2, false, true), { texto: "1,000000", expoente: " 21" });
    assert.equal(R.formatar(2.345, 2, false, true).texto, "2,35");
    assert.equal(R.mantissa(1e21), "1000000000");
    assert.equal(R.arredondarVisor(-2.345, 2, false), -2.35);
  },

  // ---------- programação
  "programa simples"() {
    teclas("f P/R f CLR_PRGM 2 × f P/R");
    assert.equal(c.modoPrograma, false);
    teclas("21 R/S");
    assert.ok(c.executando);
    rodarPrograma();
    X(42);
    assert.equal(c.pc, 0);
  },
  "programa com laco e condicional"() {
    // soma 1 a R0 até alcançar o limite guardado em R1
    teclas("f P/R f CLR_PRGM 1 STO + 0 RCL 0 RCL 1 g x≤y g GTO 08 g GTO 01 RCL 0 f P/R");
    teclas("0 STO 0 5 STO 1 R/S");
    rodarPrograma();
    X(5);
  },
  "listagem do programa"() {
    teclas("f P/R f CLR_PRGM STO 1");
    assert.equal(c.visor().texto, "01- 44  1");
    teclas("g GTO 05");
    assert.equal(c.visor().texto, "02- 43 33 05");
    teclas("f P/R");
  },
  "salvar e restaurar"() {
    teclas("1000 CHS PV 1 i 12 n 42 STO 3 g BEG f 4 f P/R 2 × f P/R");
    const salvo = c.salvar();
    const outro = new R.Motor();
    outro.restaurar(salvo);
    assert.equal(outro.x, c.x);
    assert.ok(outro.begin);
    assert.equal(outro.fixDigitos, 4);
    outro.pressionar(K.RCL);
    outro.pressionar(K.D3);
    assert.equal(outro.x, 42);
    outro.pressionar(K.D5);
    outro.pressionar(K.RS);
    while (outro.executando) outro.passo();
    assert.equal(outro.x, 10);
    // dados corrompidos não quebram nada
    const terceiro = new R.Motor();
    terceiro.restaurar("stack=a,b\nfix=99\nprog=999 x");
    assert.equal(terceiro.x, 0);
    assert.equal(terceiro.fixDigitos, 9);
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  c = new R.Motor();
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHA ${nome}\n     ${erro.message}`);
  }
}
console.log(falhas ? `\n${falhas} teste(s) falharam` : `\n${Object.keys(testes).length} testes passaram`);
process.exitCode = falhas ? 1 : 0;
