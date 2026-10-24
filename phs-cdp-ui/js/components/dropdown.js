/**
 * Wires up one `.dropdown` element: click-to-toggle trigger, click
 * outside to close, Escape to close. Markup contract:
 *   <div class="dropdown">
 *     <button class="btn ..." data-dropdown-trigger>...</button>
 *     <div class="dropdown__menu" role="menu">...</div>
 *   </div>
 */
export function initDropdown(root) {
  const trigger = root.querySelector("[data-dropdown-trigger]");
  const menu = root.querySelector(".dropdown__menu");
  if (!trigger || !menu) return;

  function close() {
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function open() {
    document.querySelectorAll(".dropdown.is-open").forEach((el) => {
      if (el !== root) el.classList.remove("is-open");
    });
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    root.classList.contains("is-open") ? close() : open();
  });

  menu.addEventListener("click", (e) => {
    if (e.target.closest(".dropdown__item")) close();
  });

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) {
      close();
      trigger.focus();
    }
  });
}

export function initAllDropdowns(root = document) {
  root.querySelectorAll(".dropdown").forEach(initDropdown);
}
