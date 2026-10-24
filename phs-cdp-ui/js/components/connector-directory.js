/**
 * Shared Directory building blocks — reused by both the Destinations
 * and Sources tables (and their detail Activity views), per the
 * "reusable Column Manager" / "reusable Connector Activity Filter"
 * requirement. Neither component knows anything about destinations or
 * sources specifically; callers pass in their own column/field lists.
 */

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ================================================================ */
/* Column Manager — a checkbox list persisted to localStorage.       */
/* ================================================================ */

/** Reads the visible-column list for `storageKey`, falling back to
 * `defaultKeys` if nothing is stored yet or storage is unavailable. */
export function getStoredColumns(storageKey, defaultKeys) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...defaultKeys];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...defaultKeys];
  } catch {
    return [...defaultKeys];
  }
}

function storeColumns(storageKey, keys) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* localStorage unavailable — selection just won't persist across visits this session */
  }
}

/**
 * Wires a Column Manager popover.
 * options: {
 *   triggerEl, panelEl, storageKey, columns: [{key,label}], defaultKeys,
 *   requiredKey (always visible, checkbox disabled), getVisible(), onApply(visibleKeys)
 * }
 */
export function initColumnManager(options) {
  const { triggerEl, panelEl, storageKey, columns, defaultKeys, requiredKey, onApply } = options;
  if (!triggerEl || !panelEl) return;
  let draft = getStoredColumns(storageKey, defaultKeys);

  function render() {
    panelEl.innerHTML = `
      <div class="col-manager__header">
        <div class="col-manager__title">Edit columns</div>
        <p class="col-manager__desc">Choose which columns appear in the table.</p>
      </div>
      <div class="col-manager__list">
        ${columns
          .map(
            (c) => `
          <label class="col-manager__item${c.key === requiredKey ? " is-required" : ""}">
            <input type="checkbox" data-col-key="${c.key}" ${draft.includes(c.key) ? "checked" : ""} ${c.key === requiredKey ? "disabled" : ""} />
            <span>${c.label}</span>
          </label>`
          )
          .join("")}
      </div>
      <div class="col-manager__footer">
        <button type="button" class="btn btn--ghost btn--sm" data-col-reset><i data-lucide="rotate-ccw"></i> Reset to default</button>
        <div class="cluster gap-2">
          <button type="button" class="btn btn--ghost btn--sm" data-col-cancel>Cancel</button>
          <button type="button" class="btn btn--primary btn--sm" data-col-apply>Apply</button>
        </div>
      </div>`;
    refreshIcons();

    panelEl.querySelectorAll("[data-col-key]").forEach((box) => {
      box.addEventListener("change", (e) => {
        const key = e.target.dataset.colKey;
        if (e.target.checked) {
          if (!draft.includes(key)) draft.push(key);
        } else {
          draft = draft.filter((k) => k !== key);
        }
      });
    });
    panelEl.querySelector("[data-col-reset]").addEventListener("click", () => {
      draft = [...defaultKeys];
      render();
    });
    panelEl.querySelector("[data-col-cancel]").addEventListener("click", close);
    panelEl.querySelector("[data-col-apply]").addEventListener("click", () => {
      storeColumns(storageKey, draft);
      onApply?.(draft);
      close();
    });
  }

  function open() {
    draft = getStoredColumns(storageKey, defaultKeys);
    render();
    panelEl.classList.add("is-open");
    document.addEventListener("mousedown", onOutsideClick, true);
  }
  function close() {
    panelEl.classList.remove("is-open");
    document.removeEventListener("mousedown", onOutsideClick, true);
  }
  function onOutsideClick(e) {
    if (!panelEl.contains(e.target) && e.target !== triggerEl && !triggerEl.contains(e.target)) close();
  }

  triggerEl.addEventListener("click", () => (panelEl.classList.contains("is-open") ? close() : open()));

  // Apply the persisted selection once at init so the table starts correct.
  onApply?.(getStoredColumns(storageKey, defaultKeys));
}

/* ================================================================ */
/* Filter Panel — generic popover of select / multiselect fields      */
/* plus an optional date-range field. Caller owns filter state; this  */
/* only renders controls and reports changes back.                    */
/* ================================================================ */

const DATE_RANGE_PRESETS_LOCAL = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Last 90 days", "Custom range"];

export function dateRangeFieldHTML(current) {
  const preset = current?.preset || "Last 7 days";
  return `
    <div class="filter-field">
      <span class="filter-field__label">Date Range</span>
      <div class="select select--sm">
        <select data-filter-daterange-preset>${DATE_RANGE_PRESETS_LOCAL.map((p) => `<option value="${p}"${p === preset ? " selected" : ""}>${p}</option>`).join("")}</select>
        <i class="select__chevron" data-lucide="chevron-down"></i>
      </div>
      <div class="cluster gap-2" data-filter-daterange-custom style="margin-top: var(--space-2);" ${preset === "Custom range" ? "" : "hidden"}>
        <input class="input" type="date" data-filter-daterange-from value="${current?.from || ""}" style="flex:1;" />
        <input class="input" type="date" data-filter-daterange-to value="${current?.to || ""}" style="flex:1;" />
      </div>
    </div>`;
}

export function wireDateRangeField(container, onChange) {
  const select = container.querySelector("[data-filter-daterange-preset]");
  const customWrap = container.querySelector("[data-filter-daterange-custom]");
  const fromInput = container.querySelector("[data-filter-daterange-from]");
  const toInput = container.querySelector("[data-filter-daterange-to]");
  select?.addEventListener("change", (e) => {
    customWrap.hidden = e.target.value !== "Custom range";
    onChange({ preset: e.target.value, from: fromInput.value, to: toInput.value });
  });
  fromInput?.addEventListener("change", () => onChange({ preset: select.value, from: fromInput.value, to: toInput.value }));
  toInput?.addEventListener("change", () => onChange({ preset: select.value, from: fromInput.value, to: toInput.value }));
}

/**
 * options: { triggerEl, panelEl, fields: [{key,label,type:"select"|"multiselect",options}],
 *   getState(), onApply(state), onClear() }
 */
export function initFilterPanel(options) {
  const { triggerEl, panelEl, fields, getState, onApply, onClear } = options;
  if (!triggerEl || !panelEl) return;

  function render() {
    const state = getState();
    panelEl.innerHTML = `
      <div class="col-manager__header">
        <div class="col-manager__title">Filter</div>
      </div>
      <div class="filter-fields">
        ${fields
          .map((f) => {
            if (f.type === "multiselect") {
              const selected = state[f.key] || [];
              return `<div class="filter-field">
                <span class="filter-field__label">${f.label}</span>
                <div class="filter-checklist">
                  ${f.options.map((o) => `<label class="filter-checklist__item"><input type="checkbox" data-filter-multi="${f.key}" value="${o}" ${selected.includes(o) ? "checked" : ""} /><span>${o}</span></label>`).join("")}
                </div>
              </div>`;
            }
            return `<div class="filter-field">
              <span class="filter-field__label">${f.label}</span>
              <div class="select select--sm">
                <select data-filter-select="${f.key}">
                  <option value="all">All</option>
                  ${f.options.map((o) => `<option value="${o}" ${state[f.key] === o ? "selected" : ""}>${o}</option>`).join("")}
                </select>
                <i class="select__chevron" data-lucide="chevron-down"></i>
              </div>
            </div>`;
          })
          .join("")}
      </div>
      <div class="col-manager__footer">
        <button type="button" class="btn btn--ghost btn--sm" data-filter-clear>Clear all</button>
        <button type="button" class="btn btn--primary btn--sm" data-filter-apply>Apply</button>
      </div>`;
    refreshIcons();

    panelEl.querySelector("[data-filter-clear]").addEventListener("click", () => {
      onClear?.();
      close();
    });
    panelEl.querySelector("[data-filter-apply]").addEventListener("click", () => {
      onApply?.(collect());
      close();
    });
  }

  function collect() {
    const result = {};
    fields.forEach((f) => {
      if (f.type === "multiselect") {
        result[f.key] = [...panelEl.querySelectorAll(`[data-filter-multi="${f.key}"]:checked`)].map((el) => el.value);
      } else {
        const sel = panelEl.querySelector(`[data-filter-select="${f.key}"]`);
        result[f.key] = sel ? sel.value : "all";
      }
    });
    return result;
  }

  function open() {
    render();
    panelEl.classList.add("is-open");
    document.addEventListener("mousedown", onOutsideClick, true);
  }
  function close() {
    panelEl.classList.remove("is-open");
    document.removeEventListener("mousedown", onOutsideClick, true);
  }
  function onOutsideClick(e) {
    if (!panelEl.contains(e.target) && e.target !== triggerEl && !triggerEl.contains(e.target)) close();
  }

  triggerEl.addEventListener("click", () => (panelEl.classList.contains("is-open") ? close() : open()));
}

/** Counts how many non-default filter values are active, for the
 * "Filter · 3" trigger-button badge. */
export function countActiveFilters(state, fields) {
  let n = 0;
  fields.forEach((f) => {
    const v = state[f.key];
    if (f.type === "multiselect") {
      if (v && v.length) n += 1;
    } else if (v && v !== "all") {
      n += 1;
    }
  });
  return n;
}
