"use strict";
const assert = require("node:assert/strict");
const C = require("../../assets/jogos/tower-defense-logica.js");

function repetir(estado, segundos) {
  for (let i = 0; i < segundos && estado.fase !== "vitoria" && estado.fase !== "derrota"; i++) C.avancar(estado, 1);
  return estado;
}
function pertoDaEstrada(p) {
  for (let i = 0; i < C.CAMINHO.length - 1; i++) {
    const a = C.CAMINHO[i], b = C.CAMINHO[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) < 55) return true;
  }
  return false;
}

const testes = {
  "o mapa tem 20 ondas e plataformas fora da estrada"() {
    assert.equal(C.ONDAS.length, 20);
    assert.equal(C.PLATAFORMAS.length, 12);
    assert.equal(new Set(C.PLATAFORMAS.map((p) => p.id)).size, 12);
    for (const p of C.PLATAFORMAS) assert.equal(pertoDaEstrada(p), false, `plataforma ${p.id} está na estrada`);
  },
  "a partida começa com recursos e preparação"() {
    const e = C.iniciar();
    assert.equal(e.moedas, 330);
    assert.equal(e.vidas, 20);
    assert.equal(e.onda, 0);
    assert.equal(e.fase, "preparacao");
    assert.equal(e.preparacao, 10);
    assert.equal(C.TEMPO_PREPARACAO, 10);
  },
  "construir debita uma vez e não aceita plataforma ocupada"() {
    const e = C.iniciar();
    assert.equal(C.construir(e, 1, "canhao"), true);
    assert.equal(e.moedas, 210);
    assert.equal(e.torres.length, 1);
    assert.equal(C.construir(e, 1, "metralhadora"), false);
    assert.equal(e.moedas, 210);
    assert.equal(C.construir(e, 999, "canhao"), false);
    assert.equal(C.construir(e, 2, "inexistente"), false);
  },
  "não constrói sem moedas"() {
    const e = C.iniciar();
    e.moedas = 20;
    assert.equal(C.construir(e, 1, "artilharia"), false);
    assert.equal(e.torres.length, 0);
    assert.equal(e.moedas, 20);
  },
  "melhoria sobe até o nível 3 e venda devolve 70%"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    e.moedas = 1000;
    const t = C.torreNa(e, 1);
    const dano1 = C.statsTorre(t).dano;
    const custo = C.custoMelhoria(t);
    assert.equal(C.melhorar(e, 1), true);
    assert.equal(t.nivel, 2);
    assert.equal(t.investido, 120 + custo);
    assert.ok(C.statsTorre(t).dano > dano1);
    assert.equal(C.melhorar(e, 1), true);
    assert.equal(t.nivel, 3);
    assert.equal(C.custoMelhoria(t), 0);
    assert.equal(C.melhorar(e, 1), false);
    const esperado = Math.floor(t.investido * 0.7);
    const antes = e.moedas;
    assert.equal(C.vender(e, 1), esperado);
    assert.equal(e.moedas, antes + esperado);
    assert.equal(e.torres.length, 0);
  },
  "a onda ordena entradas simultâneas e não começa duas vezes"() {
    const e = C.iniciar();
    assert.equal(C.iniciarOnda(e), true);
    assert.equal(e.onda, 1);
    assert.equal(e.fase, "batalha");
    assert.equal(e.fila.length, 7);
    assert.equal(C.iniciarOnda(e), false);
    assert.ok(e.fila.every((item, i, a) => !i || item.em >= a[i - 1].em));
  },
  "o primeiro tanque entra e segue a estrada"() {
    const e = C.iniciar();
    C.iniciarOnda(e);
    C.avancar(e, 0.05);
    assert.equal(e.inimigos.length, 1);
    const x = e.inimigos[0].x;
    C.avancar(e, 1);
    assert.ok(e.inimigos[0].x > x);
    assert.equal(e.inimigos[0].y, 112);
  },
  "a pausa congela preparação, inimigos e projéteis"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    C.iniciarOnda(e);
    C.avancar(e, 1);
    assert.equal(C.alternarPausa(e), true);
    const antes = JSON.stringify([e.inimigos, e.projeteis, e.preparacao]);
    C.avancar(e, 1);
    assert.equal(JSON.stringify([e.inimigos, e.projeteis, e.preparacao]), antes);
    assert.equal(C.alternarPausa(e), false);
  },
  "sem defesas os tanques atravessam e causam derrota"() {
    const e = C.iniciar();
    repetir(e, 500);
    assert.equal(e.fase, "derrota");
    assert.equal(e.vidas, 0);
    assert.ok(e.vazamentos >= 20);
  },
  "uma defesa inicial consegue atacar e render moedas"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    C.construir(e, 2, "canhao");
    C.construir(e, 4, "metralhadora");
    C.iniciarOnda(e);
    repetir(e, 80);
    assert.ok(e.abates > 0);
    assert.ok(e.moedas > 10);
    assert.ok(e.projeteis.length >= 0);
  },
  "a previsão informa os tipos e as quantidades"() {
    assert.deepEqual(C.composicao(1), [{ tipo: "leve", nome: "Tanque leve", quantidade: 7 }]);
    assert.equal(C.composicao(10).find((g) => g.tipo === "boss").quantidade, 1);
    assert.equal(C.composicao(20).find((g) => g.tipo === "boss").quantidade, 2);
    assert.deepEqual(C.composicao(21), []);
  },
  "a preparação chega automaticamente à próxima onda"() {
    const e = C.iniciar();
    e.preparacao = 0.05;
    C.avancar(e, 0.05);
    assert.equal(e.onda, 1);
    assert.equal(e.fase, "batalha");
  },
  "os projéteis nascem na ponta do canhão e alternam os canos da metralhadora"() {
    const canhao = { x: 100, y: 80, tipo: "canhao", angulo: 0, disparos: 0 };
    assert.deepEqual(C.pontaCanhao(canhao), { x: 143, y: 80 });
    canhao.angulo = Math.PI / 2;
    assert.deepEqual(C.pontaCanhao(canhao), { x: 100, y: 123 });
    const artilharia = { ...canhao, tipo: "artilharia", angulo: 0 };
    assert.deepEqual(C.pontaCanhao(artilharia), { x: 146, y: 80 });
    const metralhadora = { ...canhao, tipo: "metralhadora", angulo: 0, disparos: 0 };
    assert.deepEqual(C.pontaCanhao(metralhadora), { x: 143, y: 73 });
    metralhadora.disparos = 1;
    assert.deepEqual(C.pontaCanhao(metralhadora), { x: 143, y: 87 });
  },
  "o disparo criado pela simulação usa a ponta e não o centro da torre"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    C.iniciarOnda(e);
    for (let i = 0; i < 400 && !e.projeteis.length; i++) C.avancar(e, 0.05);
    assert.equal(e.projeteis.length, 1);
    const torre = e.torres[0];
    const projetil = e.projeteis[0];
    const esperado = C.pontaCanhao({ ...torre, disparos: 0 });
    assert.ok(Math.abs(projetil.x - esperado.x) < 0.000001);
    assert.ok(Math.abs(projetil.y - esperado.y) < 0.000001);
    assert.ok(Math.abs(C.distancia(torre, projetil) - 43) < 0.000001);
  },
  "cada abate deixa a base e a torre destruídas do veículo correto"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    C.construir(e, 2, "canhao");
    C.construir(e, 4, "metralhadora");
    C.iniciarOnda(e);
    for (let i = 0; i < 400 && !e.abates; i++) C.avancar(e, 0.2);
    assert.ok(e.abates > 0);
    const explosao = e.efeitos.find((efeito) => efeito.tipo === "explosao");
    assert.equal(explosao.duracao, 0.24);
    const destroco = e.efeitos.find((efeito) => efeito.tipo === "destrocos");
    assert.ok(destroco);
    assert.equal(destroco.tipoInimigo, "leve");
    assert.equal(destroco.duracao, 5.5);
    assert.ok([1, -1].includes(destroco.lado));
  },
  "os destrocos desaparecem também durante a preparação"() {
    const e = C.iniciar();
    e.efeitos.push({ tipo: "destrocos", tipoInimigo: "leve", tempo: 0, duracao: 0.5 });
    C.avancar(e, 0.25);
    assert.equal(e.efeitos.length, 1);
    C.avancar(e, 0.3);
    assert.equal(e.efeitos.length, 0);
  },
  "aeronaves usam rotas próprias e só defesas antiaéreas podem atacá-las"() {
    assert.notDeepEqual(C.CAMINHOS_AEREOS.helicoptero, C.CAMINHO);
    assert.notDeepEqual(C.CAMINHOS_AEREOS.aviao, C.CAMINHO);
    assert.notDeepEqual(C.CAMINHOS_AEREOS.aviao, C.CAMINHOS_AEREOS.helicoptero);
    assert.equal(C.podeAtacar("canhao", "helicoptero"), false);
    assert.equal(C.podeAtacar("canhao", "aviao"), false);
    assert.equal(C.podeAtacar("metralhadora", "helicoptero"), true);
    assert.equal(C.podeAtacar("artilharia", "aviao"), true);
    assert.equal(C.podeAtacar("canhao", "leve"), true);
    const e = C.iniciar();
    e.onda = 3;
    C.iniciarOnda(e);
    repetir(e, 6);
    const helicoptero = e.inimigos.find((inimigo) => inimigo.tipo === "helicoptero");
    assert.ok(helicoptero);
    assert.ok(Math.abs(helicoptero.y - 520) < 40);
    assert.notEqual(Math.round(helicoptero.y), 112);
    assert.ok(e.eventos.some((evento) => evento.tipo === "aereoEntrou" && evento.tipoInimigo === "helicoptero"));
    const aviacao = C.iniciar();
    aviacao.onda = 5;
    C.iniciarOnda(aviacao);
    repetir(aviacao, 8);
    assert.ok(aviacao.eventos.some((evento) => evento.tipo === "aereoEntrou" && evento.tipoInimigo === "aviao"));
  },
  "as quatro regiões mudam a cada cinco ondas e a dificuldade escala"() {
    assert.equal(C.REGIOES.length, 4);
    for (const [onda, id] of [[1, "floresta"], [5, "floresta"], [6, "deserto"], [10, "deserto"], [11, "neve"], [15, "neve"], [16, "vulcao"], [20, "vulcao"]]) {
      assert.equal(C.regiaoDaOnda(onda).id, id);
    }
    assert.ok(C.escalaInimigo(20) > C.escalaInimigo(15));
    assert.ok(C.escalaInimigo(15) > C.escalaInimigo(10));
    assert.ok(C.escalaInimigo(10) > C.escalaInimigo(1));
    assert.ok(C.ONDAS[19].reduce((total, g) => total + g.quantidade, 0) > C.ONDAS[9].reduce((total, g) => total + g.quantidade, 0));
  },
  "o reparo cobra pela vida perdida e restaura a torre"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    const torre = C.torreNa(e, 1);
    torre.vida = 50;
    const custo = C.custoReparo(torre);
    assert.equal(custo, 51);
    const antes = e.moedas;
    assert.equal(C.reparar(e, 1), true);
    assert.equal(e.moedas, antes - custo);
    assert.equal(torre.vida, C.statsTorre(torre).vidaMaxima);
    assert.equal(C.custoReparo(torre), 0);
    assert.equal(C.reparar(e, 1), false);
    torre.vida = 50;
    assert.equal(C.reparar(e, 1), false, "a recarga de 10 segundos impede reparo seguido");
    repetir(e, 10);
    assert.equal(torre.reparoRecarga, 0);
    assert.equal(C.reparar(e, 1), true);
  },
  "uma torre destruída deixa destroços e libera a plataforma"() {
    const e = C.iniciar();
    C.construir(e, 1, "canhao");
    const torre = C.torreNa(e, 1);
    C.atingirTorre(e, torre, 140);
    assert.equal(e.torres.length, 0);
    assert.equal(e.torresPerdidas, 1);
    assert.ok(e.efeitos.some((efeito) => efeito.tipo === "destrocos" && efeito.aliado));
    assert.equal(C.construir(e, 1, "metralhadora"), true);
    assert.equal(C.torreNa(e, 1).tipo, "metralhadora");
  },
  "inimigos não atiram nas duas primeiras ondas e atacam a partir da terceira"() {
    const primeira = C.iniciar();
    C.construir(primeira, 1, "canhao");
    C.iniciarOnda(primeira);
    repetir(primeira, 5);
    assert.equal(C.torreNa(primeira, 1).vida, C.TORRES.canhao.vida);
    assert.equal(primeira.projeteisInimigos.length, 0);
    const terceira = C.iniciar();
    C.construir(terceira, 1, "canhao");
    terceira.onda = 2;
    C.iniciarOnda(terceira);
    repetir(terceira, 5);
    assert.ok(C.torreNa(terceira, 1).vida < C.TORRES.canhao.vida || terceira.projeteisInimigos.length > 0);
  },
  "a campanha pode ser vencida construindo e melhorando entre as ondas"() {
    const e = C.iniciar();
    const plano = [
      [1, "canhao"], [2, "metralhadora"], [4, "metralhadora"], [7, "artilharia"],
      [9, "metralhadora"], [3, "metralhadora"], [6, "artilharia"], [8, "canhao"],
      [10, "artilharia"], [5, "canhao"], [11, "artilharia"], [12, "metralhadora"],
    ];
    for (let segundo = 0; segundo < 7000 && e.fase !== "vitoria" && e.fase !== "derrota"; segundo++) {
      // Repõe plataformas perdidas durante a própria batalha.
      for (const [pad, tipo] of plano) if (!C.torreNa(e, pad)) C.construir(e, pad, tipo);
      // Repara primeiro quem está mais próximo de ser destruído, mantendo reserva para reconstruir.
      const danificadas = [...e.torres].sort((a, b) => a.vida / C.statsTorre(a).vidaMaxima - b.vida / C.statsTorre(b).vidaMaxima);
      for (const torre of danificadas) {
        const proporcao = torre.vida / C.statsTorre(torre).vidaMaxima;
        const reserva = e.onda >= 10 ? 220 : 60;
        if (proporcao < 0.68 && e.moedas >= C.custoReparo(torre) + reserva) C.reparar(e, torre.plataforma);
      }
      // Só melhora quando todas as posições estão ocupadas e há reserva para emergências.
      if (e.torres.length === plano.length) {
        for (const torre of e.torres) {
          if (e.moedas > 250) C.melhorar(e, torre.plataforma);
        }
      }
      if (e.fase === "preparacao") C.iniciarOnda(e);
      C.avancar(e, 1);
    }
    assert.equal(e.fase, "vitoria", `parou na onda ${e.onda}, com ${e.vidas} vidas, ${e.torres.length} torres, ${e.torresPerdidas} torres perdidas, ${e.abates} abates, ${e.moedas} moedas e níveis ${e.torres.map((t) => t.nivel).join(",")}`);
    assert.equal(e.onda, 20);
    assert.ok(e.abates > 150);
    assert.ok(e.torresPerdidas > 0, "a estratégia também precisou repor torres destruídas");
  },
};

let falhas = 0;
for (const [nome, teste] of Object.entries(testes)) {
  try {
    teste();
    console.log(`ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`FALHOU ${nome}\n${erro.stack}`);
  }
}
console.log(`\n${Object.keys(testes).length - falhas} de ${Object.keys(testes).length} testes passaram`);
if (falhas) process.exit(1);
