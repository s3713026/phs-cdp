import { renderSidebar, initSidebarCollapse, initSidebarAccordion } from "./components/navigation.js";
import { renderTopbar } from "./components/topbar.js";
import { initAllTabs } from "./components/tabs.js";
import { initAllDropdowns } from "./components/dropdown.js";
import { initModals } from "./components/modal.js";
import { initDrawers } from "./components/drawer.js";
import { initAllSegmented } from "./components/select.js";
import { initAllSortableTables } from "./components/table.js";

/**
 * Shared page bootstrap. Every PHS CDP page calls this once on load,
 * passing only what's unique to that page (breadcrumb + which nav
 * item is current) — the shell itself (sidebar, topbar, icons, every
 * interactive component) is identical everywhere and lives here.
 *
 * @param {object} config
 * @param {string} config.currentNavId - id from js/data/nav-items.js
 * @param {{label:string, href?:string}[]} config.breadcrumb
 * @param {string} [config.userName]
 * @param {string} [config.userRole]
 * @param {string} [config.userInitials]
 */
export function bootstrapPage(config = {}) {
  const {
    currentNavId,
    breadcrumb = [{ label: "PHS CDP" }],
    userName = "Trương Phú Cường",
    userRole = "Admin",
    userInitials = "CT",
  } = config;

  const sidebarMount = document.querySelector("[data-sidebar-mount]");
  if (sidebarMount) {
    renderSidebar(sidebarMount, { logoSrc: "assets/logo.webp", currentNavId });
  }

  const topbarMount = document.querySelector("[data-topbar-mount]");
  if (topbarMount) {
    renderTopbar(topbarMount, { breadcrumb, userName, userRole, userInitials });
  }

  const shell = document.querySelector(".app-shell");
  if (shell) {
    document.querySelectorAll("[data-sidebar-toggle]").forEach((toggle) => {
      initSidebarCollapse(toggle, shell);
    });
  }
  if (sidebarMount) {
    initSidebarAccordion(sidebarMount);
  }

  initAllTabs();
  initAllDropdowns();
  initModals();
  initDrawers();
  initAllSegmented();
  initAllSortableTables();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
