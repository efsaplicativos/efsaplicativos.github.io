"use strict";
const filters = document.querySelector(".filters");
const cards = Array.from(document.querySelectorAll(".app-card"));
const search = document.querySelector("#app-search");
let selectedCategory = "todos";
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function updateCatalog() {
  const term = normalize(search.value);
  let visible = 0;
  for (const card of cards) {
    card.hidden = (selectedCategory !== "todos" && card.dataset.category !== selectedCategory) || !normalize(card.querySelector("h3").textContent).includes(term);
    if (!card.hidden) visible++;
  }
  document.querySelector("#filter-status").textContent = `${visible} aplicativo${visible === 1 ? "" : "s"} encontrado${visible === 1 ? "" : "s"}.`;
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
