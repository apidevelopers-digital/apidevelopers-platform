
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];

function activateTab(tab, { focusPanel = false } = {}) {
  tabs.forEach((node) => {
    const selected = node === tab;
    node.setAttribute("aria-selected", String(selected));
    node.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => {
    const active = panel.id === tab.getAttribute("aria-controls");
    panel.hidden = !active;
    panel.classList.toggle("hidden", !active);
  });
  if (focusPanel) document.getElementById(tab.getAttribute("aria-controls"))?.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = tabs.length - 1;
    tabs[target].focus();
    activateTab(tabs[target]);
  });
});

const loadButton = document.getElementById("loadButton");
const main = document.getElementById("mainContent");
if (loadButton && main) {
  const observer = new MutationObserver(() => {
    main.setAttribute("aria-busy", String(loadButton.disabled));
  });
  observer.observe(loadButton, { attributes: true, attributeFilter: ["disabled"] });
}
