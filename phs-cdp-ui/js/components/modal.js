/**
 * Wires modal open/close behavior for the whole document.
 * Markup contract:
 *   <button data-modal-open="modal-id">Open</button>
 *   <div class="modal-overlay" id="modal-id">
 *     <div class="modal" role="dialog" aria-modal="true">
 *       ...
 *       <button data-modal-close>...</button>
 *     </div>
 *   </div>
 */
let lastTrigger = null;

function openModal(overlay, trigger) {
  lastTrigger = trigger || null;
  overlay.classList.add("is-open");
  const focusable = overlay.querySelector(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  focusable?.focus();
  document.body.style.overflow = "hidden";
}

function closeModal(overlay) {
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
  lastTrigger?.focus();
}

export function initModals(root = document) {
  root.querySelectorAll("[data-modal-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const overlay = document.getElementById(trigger.dataset.modalOpen);
      if (overlay) openModal(overlay, trigger);
    });
  });

  root.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
    overlay.querySelectorAll("[data-modal-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(overlay));
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".modal-overlay.is-open");
    if (open) closeModal(open);
  });
}
