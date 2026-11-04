"use strict";
/*
 * Estatísticas de visitas com o Google Analytics 4: conta "EFS Aplicativos", propriedade
 * efsaplicativos.com.br, fluxo "Site EFS Aplicativos" (ID da métrica G-29Y6HZZ9M2). O site carrega a
 * tag do Google GTM-5C9R9438, que é a instalação recomendada pelo Analytics e já envia para o G-29Y6HZZ9M2.
 *
 * Só carrega no domínio do site: em localhost, no github.io e em arquivos abertos do computador
 * nada é enviado, para os testes não virarem visitas nos relatórios.
 *
 * Os cliques nos links de indicação da Amazon e do Mercado Livre aparecem como "click" (links
 * externos) na medição otimizada do Analytics, sem código a mais aqui.
 *
 * No Espaço Econômico Europeu, no Reino Unido e na Suíça os cookies começam negados (modo de
 * consentimento): o Analytics só recebe sinais sem cookies até a pessoa aceitar na mensagem de
 * consentimento do Google, que aparece junto com os anúncios do AdSense.
 */
(() => {
  const TAG = "GTM-5C9R9438";
  const DOMINIO = /(^|\.)efsaplicativos\.com\.br$/;
  const EUROPA = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
    "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
  ];

  if (!TAG || !DOMINIO.test(location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  // O gtag precisa receber o objeto arguments, não um array
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    region: EUROPA,
  });
  window.gtag("js", new Date());

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${TAG}`;
  document.head.append(script);
})();
