"use strict";
// Só o catálogo da página inicial tem filtros e busca
const filters = document.querySelector("#aplicativos .filters");
const cards = Array.from(document.querySelectorAll("#aplicativos .app-card"));
const search = document.querySelector("#app-search");
let selectedCategory = "todos";
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
function updateCatalog() {
  const term = normalize(search.value);
  let visible = 0;
  for (const card of cards) {
    card.hidden =
      (selectedCategory !== "todos" &&
        card.dataset.category !== selectedCategory) ||
      !normalize(card.querySelector("h3").textContent).includes(term);
    if (!card.hidden) visible++;
  }
  document.querySelector("#filter-status").textContent =
    `${visible} aplicativo${visible === 1 ? "" : "s"} encontrado${visible === 1 ? "" : "s"}.`;
  document.querySelector("#empty-state").hidden = visible !== 0;
}
if (filters) {
  filters.hidden = false;
  document.querySelector(".catalog-tools").hidden = false;
  search.addEventListener("input", updateCatalog);
  filters.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-filter]");
    if (!selected) return;
    for (const button of filters.querySelectorAll("button")) {
      const active = button === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    selectedCategory = selected.dataset.filter;
    updateCatalog();
  });
}

const header = document.querySelector(".site-header");
if (header) {
  const onScroll = () =>
    header.classList.toggle("scrolled", window.scrollY > 6);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

const themeToggle = document.querySelector("[data-theme-toggle]");
if (themeToggle) {
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  // O botão é o modo noturno: pressionado = tema escuro
  const applyTheme = (theme) => {
    const dark = theme === "dark";
    root.setAttribute("data-theme", dark ? "dark" : "light");
    themeToggle.setAttribute("aria-pressed", String(dark));
    if (themeMeta)
      themeMeta.setAttribute("content", dark ? "#0f1115" : "#f0faf5");
  };
  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("efs-theme", next);
    } catch (error) {
      /* Armazenamento indisponível: a preferência vale só nesta sessão. */
    }
  });
}

const reveals = document.querySelectorAll(".reveal");
if (reveals.length) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const element of reveals) observer.observe(element);
  } else {
    for (const element of reveals) element.classList.add("is-visible");
  }
}
