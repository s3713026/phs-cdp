/**
 * Wires drawer open/close behavior for the whole document. Same
 * contract as modal.js but for `.drawer-overlay` / `.drawer`.
 *   <button data-drawer-open="drawer-id">Open</button>
 *   <div class="drawer-overlay" id="drawer-id">
 *     <aside class="drawer" role="dialog" aria-modal="true">
 *       ...
 *       <button data-drawer-close>...</button>
 *     </aside>
 *   </div>
 */
let lastTrigger = null;

function openDrawer(overlay, trigger) {
  lastTrigger = trigger || null;
  overlay.classList.add("is-open");
  const focusable = overlay.querySelector(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  focusable?.focus();
  document.body.style.overflow = "hidden";
}

function closeDrawer(overlay) {
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
  lastTrigger?.focus();
}

export function initDrawers(root = document) {
  root.querySelectorAll("[data-drawer-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const overlay = document.getElementById(trigger.dataset.drawerOpen);
      if (overlay) openDrawer(overlay, trigger);
    });
  });

  root.querySelectorAll(".drawer-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDrawer(overlay);
    });
    overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeDrawer(overlay));
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".drawer-overlay.is-open");
    if (open) closeDrawer(open);
  });
}
