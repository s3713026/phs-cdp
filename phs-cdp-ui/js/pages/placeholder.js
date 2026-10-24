/**
 * Shared renderer for modules that don't have a real implementation
 * yet (Identity Graph, Event Explorer, Journey Builder, etc.). Every
 * sidebar item must navigate somewhere real — this keeps that
 * promise honestly instead of leaving a dead "#" link, without
 * pretending to be a finished module.
 */
export function initPlaceholder({ icon, title, description, note }) {
  const mount = document.querySelector("[data-placeholder]");
  if (!mount) return;
  mount.innerHTML = `
    <div class="stack gap-4" style="max-width: 480px; padding: var(--space-16) 0; align-items: flex-start;">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); color: var(--text-tertiary);">
        <i data-lucide="${icon}" style="width:18px; height:18px;"></i>
      </span>
      <div>
        <h2 class="section__title" style="margin-bottom: var(--space-2);">${title}</h2>
        <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-relaxed);">${description}</p>
      </div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary);">${note || "This module hasn't been built yet in this prototype."}</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}
