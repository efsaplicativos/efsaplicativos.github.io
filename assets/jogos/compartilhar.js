"use strict";
/*
 * Compartilhar o resultado em texto, no estilo dos jogos de palavra do dia: monta um resumo curto,
 * copia para a área de transferência (com plano B para navegador antigo) e dá o retorno no botão.
 * Sem servidor, sem imagem e sem link de rastreio: o texto é só texto.
 */
const Compartilhar = (() => {
  const SITE = "efsaplicativos.com.br";
  const ASSINATURA = `EFS Aplicativos · ${SITE}`;
  const FEITO = "✅";
  const FALTA = "⬜";

  const doisDigitos = (n) => String(n).padStart(2, "0");

  /** "09/11/2026" */
  function dataCurta(data = new Date()) {
    const d = data instanceof Date && !Number.isNaN(data.getTime()) ? data : new Date();
    return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  /** "✅✅⬜" a partir de uma lista de booleanos, com rótulo opcional para leitor de tela. */
  function marcas(feitos) {
    return feitos.map((feito) => (feito ? FEITO : FALTA)).join("");
  }

  /** Junta as linhas, sem linha vazia no fim. */
  const juntar = (linhas) => linhas.filter((l) => l !== null && l !== undefined && l !== "").join("\n");

  /** Resumo de uma partida: título, placar, detalhes e assinatura com o endereço. */
  function resumo({ titulo, placar = "", detalhes = [], endereco = "" }) {
    return juntar([
      titulo,
      placar,
      ...detalhes,
      endereco ? `${ASSINATURA} · ${endereco}` : ASSINATURA,
    ]);
  }

  /** Copia para a área de transferência. Devolve true quando deu certo. */
  async function copiar(texto) {
    if (!texto) return false;
    try {
      if (typeof navigator === "object" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) {
      /* segue para o plano B */
    }
    try {
      if (typeof document !== "object") return false;
      const area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const deu = document.execCommand && document.execCommand("copy");
      area.remove();
      return Boolean(deu);
    } catch (e) {
      return false;
    }
  }

  /**
   * Liga um botão ao compartilhamento: chama `obterTexto()` no clique, copia e troca o rótulo por um
   * aviso curto. O aviso também vai para `#...-aviso`, quando existir, para o leitor de tela.
   */
  function ligar(botao, obterTexto, { rotulo = "Copiar resultado", aviso = null } = {}) {
    if (!botao) return;
    const original = botao.textContent;
    let voltar = null;
    botao.textContent = rotulo;
    botao.addEventListener("click", async () => {
      const texto = obterTexto();
      const deu = await copiar(texto);
      if (aviso) aviso.textContent = deu ? "Resultado copiado: cole onde quiser." : "Não foi possível copiar; selecione o texto do resultado.";
      botao.textContent = deu ? "Copiado!" : "Copie manualmente";
      if (voltar) clearTimeout(voltar);
      voltar = setTimeout(() => {
        botao.textContent = rotulo || original;
      }, 2500);
    });
  }

  return { SITE, ASSINATURA, FEITO, FALTA, dataCurta, marcas, juntar, resumo, copiar, ligar };
})();

if (typeof module === "object") module.exports = Compartilhar;
