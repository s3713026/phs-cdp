/*
  PHS CDP — primary information architecture.
  Single source of truth for the Sidebar component. Every page calls
  renderSidebar() with this data plus its own `currentNavId` — the
  sidebar markup itself never changes as real pages get built; only
  which id is marked current does.

  Each item carries a stable `id` (used for active-state matching,
  independent of `href`, since most hrefs are still "#" placeholders
  until the module is actually built).

  A section with a single item (no `label`) renders as a plain link,
  not a header — Dashboard and Data Flows don't have sub-pages, so a
  heading that just repeats the link text below it would be redundant.
  Sections with 2+ items get a collapsible header (icon + label +
  chevron).
*/

export const NAV_SECTIONS = [
  {
    label: null,
    items: [{ id: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "dashboard.html" }],
  },
  {
    label: null,
    items: [{ id: "data-flows", label: "Data Flows", icon: "workflow", href: "data-flows.html" }],
  },
  {
    label: "Customers",
    icon: "users",
    items: [
      { id: "customer-360", label: "Customer 360", icon: "circle-user-round", href: "customer-360.html" },
      { id: "identity-graph", label: "Identity Graph", icon: "network", href: "identity-graph.html" },
    ],
  },
  {
    label: "Audiences",
    icon: "users-round",
    items: [
      { id: "all-audiences", label: "All Audiences", icon: "users-round", href: "audiences.html" },
      { id: "segment-builder", label: "Segment Builder", icon: "git-branch", href: "audiences.html?view=builder" },
      { id: "audience-insights", label: "Audience Insights", icon: "pie-chart", href: "audience-insights.html" },
      { id: "rfm-analysis", label: "RFM Analysis", icon: "grid-3x3", href: "rfm-analytics.html" },
    ],
  },
  {
    label: "Monitor",
    icon: "gauge",
    items: [
      { id: "live-events", label: "Live Events", icon: "radio", href: "live-events.html" },
      { id: "event-streams", label: "Event Streams", icon: "cable", href: "event-streams.html" },
    ],
  },
  {
    label: "Governance",
    icon: "shield",
    items: [
      { id: "data-governance", label: "Data Governance", icon: "fingerprint", href: "data-governance.html" },
      { id: "data-catalog", label: "Data Catalog", icon: "folder-tree", href: "data-catalog.html" },
      { id: "tracking-plans", label: "Tracking Plans", icon: "clipboard-check", href: "tracking-plans.html" },
      { id: "consent-management", label: "Consent Management", icon: "scale", href: "consent-management.html" },
    ],
  },
  {
    label: "Journeys",
    icon: "workflow",
    items: [
      { id: "all-journeys", label: "All Journeys", icon: "workflow", href: "all-journeys.html" },
      { id: "journey-builder", label: "Journey Builder", icon: "waypoints", href: "journey-builder.html" },
    ],
  },
  {
    label: "Activation",
    icon: "send",
    items: [
      // Connections/Sources/Destinations moved into the Data group
      // below (RudderStack-aligned IA) — no separate Activation entry
      // for them any more, so there is exactly one canonical path to
      // each, not two.
      { id: "campaigns", label: "Campaigns", icon: "megaphone", href: "campaigns.html" },
      { id: "content", label: "Content", icon: "layout-template", href: "content.html" },
    ],
  },
  {
    label: "Data",
    icon: "database",
    items: [
      // RudderStack-aligned connection-management IA: Directory
      // (available connector types) -> Sources -> Destinations ->
      // Transformations, with the Source<->Destination relationship
      // visualization living on Data Flows (top of the sidebar) rather
      // than a separate "Connections" page — the old standalone
      // two-column Sources/Destinations inventory there duplicated
      // what Sources/Destinations already show, so that nav entry and
      // page are gone; connections.html now redirects to Data Flows
      // for any stale link. "Data Sources" is likewise gone as a
      // distinct nav item since Sources below is its one canonical
      // replacement.
      { id: "directory", label: "Directory", icon: "layout-grid", href: "directory.html" },
      { id: "connections", label: "Connection Manager", icon: "git-branch", href: "connection-manager.html" },
      { id: "sources", label: "Sources", icon: "arrow-down-to-line", href: "sources.html" },
      { id: "destinations", label: "Destinations", icon: "arrow-up-from-line", href: "destinations.html" },
      { id: "transformations", label: "Transformations", icon: "shuffle", href: "transformations.html" },
      { id: "schemas", label: "Schemas", icon: "table-2", href: "#" },
      { id: "pipelines", label: "Pipelines", icon: "git-branch", href: "pipelines.html" },
      { id: "data-quality", label: "Data Quality", icon: "badge-check", href: "data-quality.html" },
      { id: "consent-preferences", label: "Consent & Preferences", icon: "shield-check", href: "consent-preferences.html" },
    ],
  },
  {
    label: "Settings",
    icon: "settings",
    items: [
      { id: "workspace", label: "Workspace", icon: "building-2", href: "#" },
      { id: "users-roles", label: "Users & Roles", icon: "users", href: "#" },
      { id: "api-keys", label: "API Keys", icon: "key-round", href: "#" },
      { id: "integrations", label: "Integrations", icon: "plug-zap", href: "integrations.html" },
    ],
  },
  {
    label: "Administration",
    icon: "shield-alert",
    items: [
      { id: "admin-infrastructure", label: "Infrastructure", icon: "server", href: "admin-integrations.html" },
    ],
  },
];

/* Not part of the product IA — utility pages for building/QAing the
   design system and shell themselves. Remove this section once
   Dashboard ships as the real landing page. */
export const NAV_DEV_SECTION = {
  label: "Developer",
  icon: "code-2",
  items: [
    { id: "design-system", label: "Design System", icon: "palette", href: "design-system.html" },
    { id: "shell-preview", label: "Shell Preview", icon: "panel-left", href: "shell-preview.html" },
  ],
};
