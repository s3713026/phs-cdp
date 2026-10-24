/**
 * Renders a chevron-separated breadcrumb trail as an HTML string.
 * `segments`: [{ label, href? }] — the first segment is the app root
 * (linked, if it has an href); the last is the current page (never
 * a link, always bold). Used by topbar.js; a page can also drop this
 * into its own PageHeader markup if the persistent topbar breadcrumb
 * isn't enough context (deep-nested detail views, for example).
 */
export function breadcrumbHTML(segments) {
  return segments
    .map((seg, i) => {
      const isLast = i === segments.length - 1;
      const chevron = i > 0 ? '<i data-lucide="chevron-right"></i>' : "";
      const label = isLast
        ? `<strong>${seg.label}</strong>`
        : seg.href
        ? `<a href="${seg.href}">${seg.label}</a>`
        : `<span>${seg.label}</span>`;
      return chevron + label;
    })
    .join("");
}
