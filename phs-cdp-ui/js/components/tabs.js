/**
 * Wires up one `[role="tablist"]` element: click + arrow-key activation,
 * showing the matching `[role="tabpanel"]` and hiding the rest.
 * Markup contract:
 *   <div class="tabs" role="tablist">
 *     <button class="tabs__tab" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
 *     ...
 *   </div>
 *   <div class="tabs__panel" role="tabpanel" id="panel-a">...</div>
 */
export function initTabs(tablist) {
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  function activate(tab, { focus = true } = {}) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab, { focus: false }));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + dir + tabs.length) % tabs.length];
        activate(next);
      }
    });
  });
}

export function initAllTabs(root = document) {
  root.querySelectorAll('[role="tablist"]').forEach(initTabs);
}
