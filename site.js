"use strict";
const filters = document.querySelector(".filters");
const cards = Array.from(document.querySelectorAll(".app-card"));
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
  const applyTheme = (theme) => {
    const light = theme === "light";
    root.setAttribute("data-theme", light ? "light" : "dark");
    themeToggle.setAttribute("aria-pressed", String(light));
    themeToggle.setAttribute(
      "aria-label",
      light ? "Ativar tema escuro" : "Ativar tema claro",
    );
    if (themeMeta)
      themeMeta.setAttribute("content", light ? "#f3f6ff" : "#050a1e");
  };
  applyTheme(root.getAttribute("data-theme") === "light" ? "light" : "dark");
  themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
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
