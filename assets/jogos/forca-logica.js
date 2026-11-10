"use strict";
/*
 * Jogo da forca: seis erros, letras acentuadas comparadas sem acento e dica em cada palavra.
 * A partida é imutável: cada tentativa devolve outra partida.
 */
const LogicaForca = (() => {
  const MAX_ERROS = 6;
  const TEMAS = {
    animais: ["animais", "Animais", [
      ["JACARE", "réptil de rio com couro duro"],
      ["TARTARUGA", "anda devagar e carrega a casa"],
      ["GIRAFA", "o pescoço mais comprido da savana"],
      ["MORCEGO", "mamífero que voa"],
      ["POLVO", "tem oito braços"],
      ["TUCANO", "ave de bico colorido"],
      ["CAPIVARA", "o maior roedor do mundo"],
      ["BALEIA", "mamífero marinho gigante"],
    ]],
    frutas: ["frutas", "Frutas", [
      ["ABACAXI", "tem coroa e espinhos"],
      ["GOIABA", "por dentro é rosa ou branca"],
      ["MANGA", "doce e amarela por dentro"],
      ["MARACUJA", "azedinha por natureza"],
      ["JABUTICABA", "fruta preta do pé"],
      ["CAJU", "a castanha vem junto"],
      ["PITANGA", "vermelhinha e pequena"],
    ]],
    paises: ["paises", "Países", [
      ["BRASIL", "o país do futebol"],
      ["ARGENTINA", "vizinho do sul"],
      ["PORTUGAL", "do outro lado do Atlântico"],
      ["JAPAO", "terra do sol nascente"],
      ["CANADA", "a folha está na bandeira"],
      ["EGITO", "tem pirâmides"],
      ["AUSTRALIA", "país continente"],
    ]],
    profissoes: ["profissoes", "Profissões", [
      ["PROFESSOR", "trabalha com alunos"],
      ["ELETRICISTA", "cuida da fiação"],
      ["PADEIRO", "acorda cedo para o pão"],
      ["BOMBEIRO", "apaga incêndios"],
      ["ADVOGADO", "defende no tribunal"],
      ["COZINHEIRO", "comanda a cozinha"],
      ["MOTORISTA", "vive ao volante"],
    ]],
    objetos: ["objetos", "Objetos de casa", [
      ["GELADEIRA", "conserva os alimentos"],
      ["TRAVESSEIRO", "fica embaixo da cabeça"],
      ["VASSOURA", "tira a poeira do chão"],
      ["CHUVEIRO", "fica no banheiro"],
      ["TESOURA", "tem duas lâminas"],
      ["CADEIRA", "serve para sentar"],
      ["LANTERNA", "ilumina no escuro"],
    ]],
  };

  const semAcento = (texto) =>
    String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

  const acertou = (partida) => [...partida.palavra].every((c) => c === " " || c === "-" || partida.letras.includes(c));
  const perdeu = (partida) => partida.erros >= MAX_ERROS;

  const congelar = (dados) => {
    const vitoria = acertou(dados);
    const derrota = !vitoria && perdeu(dados);
    return Object.freeze({
      ...dados,
      letras: Object.freeze(dados.letras),
      vitoria,
      derrota,
      terminada: vitoria || derrota,
    });
  };

  /** Começa uma partida com uma palavra sorteada do tema. */
  function iniciar({ tema = "animais", aleatorio = Math.random } = {}) {
    const escolhido = TEMAS[tema] || TEMAS.animais;
    const lista = escolhido[2];
    const [palavra, dica] = lista[Math.floor(aleatorio() * lista.length)];
    return congelar({ tema: escolhido[0], palavra: semAcento(palavra), dica, letras: [], erros: 0 });
  }

  /** Tenta uma letra. Letra repetida, inválida ou partida encerrada devolvem a mesma partida. */
  function tentar(partida, letra) {
    if (partida.terminada) return partida;
    const normalizada = semAcento(letra).trim();
    if (!/^[A-Z]$/.test(normalizada) || partida.letras.includes(normalizada)) return partida;
    const erros = partida.palavra.includes(normalizada) ? partida.erros : partida.erros + 1;
    return congelar({ ...partida, letras: [...partida.letras, normalizada], erros });
  }

  /** Palavra com as letras já descobertas. */
  const mascara = (partida) => [...partida.palavra].map((c) => (c === " " || c === "-" ? c : partida.letras.includes(c) ? c : "_"));

  return { MAX_ERROS, TEMAS, semAcento, iniciar, tentar, acertou, perdeu, mascara };
})();

if (typeof module === "object") module.exports = LogicaForca;
