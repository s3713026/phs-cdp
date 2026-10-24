import { NAV_SECTIONS, NAV_DEV_SECTION } from "../data/nav-items.js";

function renderLink(item, currentNavId) {
  const current = item.id === currentNavId ? ' aria-current="page"' : "";
  return `
    <a class="sidebar__link" href="${item.href}" data-tooltip="${item.label}" data-tooltip-pos="right"${current}>
      <i data-lucide="${item.icon}"></i>
      <span class="sidebar__link-label">${item.label}</span>
    </a>`;
}

function renderSection(section, index, currentNavId) {
  const groupId = `sidebar-group-${index}`;

  if (!section.label) {
    // Single-item section: a plain link, no redundant heading.
    return `<div class="sidebar__group">${section.items.map((i) => renderLink(i, currentNavId)).join("")}</div>`;
  }

  const isCurrentGroup = section.items.some((i) => i.id === currentNavId);

  return `
    <div class="sidebar__group">
      <button class="sidebar__group-header" aria-expanded="true" aria-controls="${groupId}">
        <i data-lucide="${section.icon}" class="sidebar__group-icon"></i>
        <span class="sidebar__group-label">${section.label}</span>
        <i data-lucide="chevron-down" class="sidebar__group-chevron"></i>
      </button>
      <div class="sidebar__group-items" id="${groupId}" data-expanded="true">
        ${section.items.map((i) => renderLink(i, currentNavId)).join("")}
      </div>
    </div>`;
}

/**
 * Renders the Sidebar component into `container` from the shared
 * NAV_SECTIONS data. Every page includes this same call — the
 * sidebar markup lives here once, never copy-pasted per page.
 *
 * @param {string} [currentNavId] the `id` of the nav item that
 *   represents the page currently being viewed (marks aria-current).
 */
export function renderSidebar(container, { logoSrc, currentNavId } = {}) {
  const sections = [...NAV_SECTIONS, NAV_DEV_SECTION];

  container.innerHTML = `
    <div class="sidebar">
      <div class="sidebar__brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="Phu Hung Securities" />` : ""}
        <div class="sidebar__brand-text">
          <span class="sidebar__brand-name">PHS CDP</span>
          <span class="sidebar__brand-sub">Customer Data Platform</span>
        </div>
      </div>
      <nav class="sidebar__nav" aria-label="Primary">
        ${sections.map((s, i) => renderSection(s, i, currentNavId)).join("")}
      </nav>
    </div>
  `;
}

/** Toggles the app shell between full and icon-only (collapsed) rail. */
export function initSidebarCollapse(toggleEl, shellEl) {
  toggleEl.addEventListener("click", () => {
    const collapsed = shellEl.classList.toggle("app-shell--collapsed");
    toggleEl.setAttribute("aria-pressed", String(collapsed));
  });
}

/**
 * Wires the expand/collapse behavior for each section's sub-navigation.
 * Animates via max-height so the transition stays smooth without a
 * layout library. Defaults to expanded — matches the sidebar's prior
 * always-open behavior, just now toggleable.
 */
export function initSidebarAccordion(root) {
  root.querySelectorAll(".sidebar__group-header").forEach((header) => {
    const panel = document.getElementById(header.getAttribute("aria-controls"));
    if (!panel) return;

    header.addEventListener("click", () => {
      const expanded = header.getAttribute("aria-expanded") === "true";
      if (expanded) {
        panel.style.maxHeight = panel.scrollHeight + "px";
        requestAnimationFrame(() => {
          panel.style.maxHeight = "0px";
        });
        header.setAttribute("aria-expanded", "false");
        panel.dataset.expanded = "false";
      } else {
        panel.style.maxHeight = panel.scrollHeight + "px";
        header.setAttribute("aria-expanded", "true");
        panel.dataset.expanded = "true";
        panel.addEventListener(
          "transitionend",
          () => {
            if (panel.dataset.expanded === "true") panel.style.maxHeight = "none";
          },
          { once: true }
        );
      }
    });
  });
}
