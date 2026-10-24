/**
 * Wires up sortable table headers. Markup contract:
 *   <th aria-sort="none" data-sort-type="string|number">
 *     <span class="th-sort">Label <i data-lucide="chevron-down"></i></span>
 *   </th>
 * Purely a visual/aria-state demo — real sorting is a backend/data
 * concern once tables are wired to live data.
 */
export function initSortableTable(table) {
  const headers = Array.from(table.querySelectorAll("th[aria-sort]"));
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const current = th.getAttribute("aria-sort");
      const next = current === "ascending" ? "descending" : "ascending";
      headers.forEach((h) => h.setAttribute("aria-sort", h === th ? next : "none"));
    });
  });
}

export function initAllSortableTables(root = document) {
  root.querySelectorAll("table.table").forEach(initSortableTable);
}
