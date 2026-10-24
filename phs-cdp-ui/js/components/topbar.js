import { breadcrumbHTML } from "./breadcrumb.js";

/**
 * Renders the Topbar component into `container`. Every page includes
 * this same call — search, notifications, help and the user menu are
 * identical everywhere; only `breadcrumb` changes per page.
 *
 * @param {{label:string, href?:string}[]} breadcrumb
 * @param {string} userName
 * @param {string} userRole
 * @param {string} userInitials
 */
export function renderTopbar(container, { breadcrumb = [], userName, userRole, userInitials }) {
  container.innerHTML = `
    <div class="topbar">
      <div class="topbar__left">
        <button class="topbar__icon-btn" data-sidebar-toggle aria-label="Toggle sidebar" aria-pressed="false">
          <i data-lucide="menu"></i>
        </button>
        <div class="topbar__crumb">
          ${breadcrumbHTML(breadcrumb)}
        </div>
      </div>
      <div class="topbar__right">
        <div class="search-field">
          <i data-lucide="search"></i>
          <input class="input" type="text" placeholder="Search customers, segments, events…" style="width: 280px;" />
        </div>
        <button class="topbar__icon-btn" data-tooltip="Notifications">
          <i data-lucide="bell"></i>
          <span class="badge-dot"></span>
        </button>
        <button class="topbar__icon-btn" data-tooltip="Help">
          <i data-lucide="circle-help"></i>
        </button>
        <div class="dropdown">
          <button class="topbar__user" data-dropdown-trigger aria-haspopup="true" aria-expanded="false">
            <span class="avatar">${userInitials}</span>
            <span class="topbar__user-meta">
              <span class="topbar__user-name">${userName}</span>
              <span class="topbar__user-role">${userRole}</span>
            </span>
            <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-tertiary);"></i>
          </button>
          <div class="dropdown__menu" role="menu">
            <div class="dropdown__label">Account</div>
            <button class="dropdown__item" role="menuitem"><i data-lucide="user-round"></i>Profile</button>
            <button class="dropdown__item" role="menuitem"><i data-lucide="settings"></i>Workspace settings</button>
            <hr class="dropdown__separator" />
            <button class="dropdown__item dropdown__item--danger" role="menuitem"><i data-lucide="log-out"></i>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
