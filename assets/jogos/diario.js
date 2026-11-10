"use strict";
/*
 * Modo diário: a mesma partida para todo mundo, no mesmo dia, sem servidor.
 * A data local vira uma semente estável (hash FNV-1a do texto "<jogo>|AAAA-MM-DD") e alimenta
 * um gerador mulberry32 — a mesma semente devolve sempre a mesma sequência de números.
 */
const Diario = (() => {
  const PREFIXO = "efs-diario-";
  const doisDigitos = (n) => String(n).padStart(2, "0");

  /** A data de hoje como "AAAA-MM-DD", no fuso do aparelho. */
  function chave(data = new Date()) {
    const d = data instanceof Date && !Number.isNaN(data.getTime()) ? data : new Date();
    return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
  }

  /** Hash estável do texto num inteiro de 32 bits (FNV-1a). */
  function semente(texto) {
    let hash = 0x811c9dc5;
    const limpo = String(texto);
    for (let i = 0; i < limpo.length; i++) {
      hash ^= limpo.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  /** Gerador determinístico: devolve sempre valores em [0, 1), como Math.random. */
  function gerador(numero) {
    let estado = numero >>> 0;
    return () => {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A partida do dia de um jogo: a data, a semente e o gerador prontos para uso. */
  function doDia(slug, data = new Date()) {
    const dia = chave(data);
    const numero = semente(`${slug}|${dia}`);
    return { data: dia, semente: numero, gerador: gerador(numero) };
  }

  function ler(slug) {
    try {
      return localStorage.getItem(PREFIXO + slug);
    } catch (e) {
      return null;
    }
  }

  function gravar(slug, valor) {
    try {
      localStorage.setItem(PREFIXO + slug, String(valor));
    } catch (e) {
      /* sem armazenamento: vale só nesta visita */
    }
  }

  /** O jogo de hoje já foi completado neste navegador? */
  const concluido = (slug, data = new Date()) => ler(slug) === chave(data);

  const marcarConcluido = (slug, data = new Date()) => gravar(slug, chave(data));

  /** Apaga a marca do jogo (usado no hub dos desafios para recomeçar o dia). */
  function limpar(slug) {
    try {
      localStorage.removeItem(PREFIXO + slug);
    } catch (e) {
      /* sem armazenamento: nada a apagar */
    }
  }

  return { PREFIXO, chave, semente, gerador, doDia, ler, gravar, limpar, concluido, marcarConcluido };
})();

if (typeof module === "object") module.exports = Diario;
