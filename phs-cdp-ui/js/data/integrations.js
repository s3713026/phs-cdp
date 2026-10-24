/*
  PHS CDP — Integrations mock data.

  Integrations is a platform-level integration management area — it
  tracks WHETHER PHS CDP can reach a given external platform at all
  (environment, configuration status, owner, last connection check),
  distinct from Sources/Destinations (js/data/sources.js,
  js/data/destinations.js), which configure WHAT data streams to/from
  an already-integrated system. A platform can appear in both places
  for different reasons — e.g. AppsFlyer is both a Source (event
  stream) and an Integration (platform-level health) — without this
  being a duplicate, the same way a company has both a network
  connection and an application-level account with a vendor.

  Every status here is prototype/demo data — nothing is a live
  connection. `demo: true` on every record exists specifically so the
  UI never has to guess whether to show a "demo" label.
  `neverVerified: true` additionally marks platforms (RudderStack)
  where NO connection has ever actually been made, so the UI can
  refuse to ever imply otherwise, even via the mock "Check Connection"
  action below.
*/

export const INTEGRATIONS = [
  {
    id: "int-rudderstack",
    name: "RudderStack",
    icon: "workflow",
    type: "Customer Data Platform / Event Pipeline",
    environment: "Planned",
    status: "Not Connected",
    owner: "Data Platform Team",
    lastCheck: null,
    demo: true,
    neverVerified: true,
    description:
      "Represents a planned RudderStack deployment for event collection, identity resolution and activation routing. This prototype does not connect to a live RudderStack workspace — see the Identity Graph and Data Governance modules for the conceptual model this UI is designed around.",
  },
  {
    id: "int-crm",
    name: "CRM",
    icon: "building-2",
    type: "Core Data Source",
    environment: "Demo",
    status: "Connected",
    owner: "CRM Team",
    lastCheck: "2 min ago",
    demo: true,
    neverVerified: false,
    description: "Source of customer account, trading account and KYC profile records. Demo connection only — see Sources for stream-level configuration.",
  },
  {
    id: "int-ga4",
    name: "Google Analytics 4",
    icon: "bar-chart-3",
    type: "Analytics",
    environment: "Demo",
    status: "Connected",
    owner: "Marketing Analytics",
    lastCheck: "8 min ago",
    demo: true,
    neverVerified: false,
    description: "Web and app behavioral analytics platform. Demo connection only — no analytics data is actually exchanged in this prototype.",
  },
  {
    id: "int-appsflyer",
    name: "AppsFlyer",
    icon: "radar",
    type: "Attribution",
    environment: "Demo",
    status: "Warning",
    owner: "Growth",
    lastCheck: "42 min ago",
    demo: true,
    neverVerified: false,
    description: "Mobile attribution and marketing analytics platform. Demo connection shows a simulated degraded check, matching Dashboard → Platform Health.",
  },
  {
    id: "int-n8n",
    name: "n8n",
    icon: "workflow",
    type: "Workflow Automation",
    environment: "Demo",
    status: "Disconnected",
    owner: "Platform Engineering",
    lastCheck: "6 hours ago",
    demo: true,
    neverVerified: false,
    description: "Workflow automation engine used for internal orchestration tasks. Demo connection shows a simulated offline check, matching Dashboard → Platform Health.",
  },
];

export const STATUS_BADGE = {
  Connected: "badge--success",
  Warning: "badge--warning",
  Disconnected: "badge--danger",
  "Not Connected": "badge--neutral",
};

export function getIntegrationById(id) {
  return INTEGRATIONS.find((i) => i.id === id);
}

export function integrationsSummary() {
  return {
    total: INTEGRATIONS.length,
    connected: INTEGRATIONS.filter((i) => i.status === "Connected").length,
    attention: INTEGRATIONS.filter((i) => i.status === "Warning" || i.status === "Disconnected").length,
    planned: INTEGRATIONS.filter((i) => i.environment === "Planned").length,
  };
}
