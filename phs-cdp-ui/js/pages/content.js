/*
  Content / Templates (Activation) — a single reusable content library
  (list + editor), not one page per channel; channel is a filter/field,
  not a route. See js/data/content.js for the Template model and why a
  Campaign references content by id instead of duplicating it.

  The Email editor is a simplified block-based builder (blocks palette
  + canvas + per-block properties + Design/Code tabs) — a prototype
  conceptually aligned with GrapesJS-style builders, not a production
  drag-and-drop engine. Push/SMS/Zalo use structured field editors;
  Web Message/In-App reuse the same lightweight block-list approach as
  Email (Text/Image/Button/Container), skinned as a browser popup /
  mobile app preview respectively.
*/
import {
  CONTENT,
  CONTENT_CHANNELS,
  CONTENT_STATUSES,
  CONTENT_VARIABLES,
  EMAIL_BLOCK_TYPES,
  WEB_MESSAGE_TEMPLATES,
  IN_APP_TEMPLATES,
  LAYOUT_BLOCK_TYPES,
  getContentById,
  channelFieldKey,
  addContent,
  updateContent,
  duplicateContent,
} from "../data/content.js";
import { CAMPAIGNS } from "../data/campaigns.js";
import { initFilterPanel, countActiveFilters } from "../components/connector-directory.js";

let filterState = { query: "", channel: [], status: [], type: [] };
let editingId = null; // null while creating new content
let draftChannelData = {}; // per-channel field buffers while editing
let selectedBlockId = null; // currently-selected block in a block-based editor
let codeMode = false; // Email: Design vs Code tab

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function uid() {
  return `el-${Math.random().toString(36).slice(2, 9)}`;
}
function esc(s) {
  return (s || "").replace(/</g, "&lt;");
}
function statusBadge(status) {
  return `<span class="badge ${status === "Active" ? "badge--success" : "badge--neutral"}">${status}</span>`;
}
function channelIcon(channel) {
  return { Email: "mail", Push: "bell", "Web Message": "monitor", "In-App": "smartphone", SMS: "message-square-text", Zalo: "send" }[channel] || "layout-template";
}
function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-editor]").hidden = view !== "editor";
  window.scrollTo({ top: 0 });
}

/* ================================================================ */
/* List                                                                */
/* ================================================================ */
function filteredContent() {
  const q = filterState.query.trim().toLowerCase();
  return CONTENT.filter((c) => !q || c.name.toLowerCase().includes(q) || c.channel.toLowerCase().includes(q))
    .filter((c) => !filterState.channel.length || filterState.channel.includes(c.channel))
    .filter((c) => !filterState.status.length || filterState.status.includes(c.status))
    .filter((c) => !filterState.type.length || filterState.type.includes(c.type));
}
function renderList() {
  const tbody = document.querySelector("[data-content-table] tbody");
  const rows = filteredContent();
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (c) => `<tr data-content-row="${c.id}" style="cursor: pointer;">
      <td><div class="event-cell"><span class="event-cell__icon"><i data-lucide="${channelIcon(c.channel)}"></i></span><div><div class="event-cell__name">${c.name}</div><div class="event-cell__meta">${c.description}</div></div></div></td>
      <td class="cell-muted">${c.channel}</td>
      <td class="cell-muted">${c.type}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="cell-muted tabular-nums">${c.updatedAt}</td>
      <td class="cell-muted">${c.owner}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="table__empty">No content matches the current filters.</td></tr>`;
  refreshIcons();
  tbody.querySelectorAll("[data-content-row]").forEach((row) => {
    row.addEventListener("click", () => openEditor(row.dataset.contentRow));
  });
}
function initSearchAndFilter() {
  document.querySelector("[data-content-search]").addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderList();
  });
  const fields = [
    { key: "channel", label: "Channel", type: "multiselect", options: CONTENT_CHANNELS },
    { key: "status", label: "Status", type: "multiselect", options: CONTENT_STATUSES },
    { key: "type", label: "Type", type: "multiselect", options: ["Template"] },
  ];
  const countBadge = document.querySelector("[data-content-filter-count]");
  function updateBadge() {
    const n = countActiveFilters(filterState, fields);
    countBadge.hidden = n === 0;
    countBadge.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-content-filter-trigger]"),
    panelEl: document.querySelector("[data-content-filter-panel]"),
    fields,
    getState: () => filterState,
    onApply: (state) => {
      filterState = { ...filterState, ...state };
      updateBadge();
      renderList();
    },
    onClear: () => {
      filterState = { query: filterState.query, channel: [], status: [], type: [] };
      updateBadge();
      renderList();
    },
  });
  updateBadge();
}

/* ================================================================ */
/* Email block editor — blocks palette + canvas + properties-on-select */
/* + Design/Code tabs. A simplified, prototype-level GrapesJS-style    */
/* builder: reorder via native HTML5 drag, not pixel-precise layout.   */
/* ================================================================ */
function defaultBlockProps(type) {
  const map = {
    Header: { text: "Your Header Here", size: "Large" },
    Text: { text: "Add your message here.", align: "left", size: "Normal", color: "" },
    Image: { url: "", alt: "", width: "100%", link: "" },
    Button: { label: "Call to Action", link: "", style: "Primary" },
    Divider: {},
    Spacer: { height: "Medium" },
    Columns: { left: "Left column text", right: "Right column text" },
    Social: { platforms: "Facebook, Zalo, YouTube" },
    Footer: { text: "PHS Securities · Unsubscribe" },
  };
  return map[type] || {};
}
function ensureEmailBlocks(data) {
  if (!data.blocks) {
    data.blocks = data.body ? [{ id: uid(), type: "Text", props: { text: data.body, align: "left", size: "Normal", color: "" } }] : [];
  }
  return data.blocks;
}
function blockPreviewHTML(block) {
  const p = block.props;
  switch (block.type) {
    case "Header":
      return `<div style="font-size:20px; font-weight:600; padding:12px 0;">${esc(p.text)}</div>`;
    case "Text":
      return `<div style="font-size:14px; text-align:${p.align}; color:${p.color || "var(--text-primary)"}; white-space:pre-wrap; padding:8px 0;">${esc(p.text)}</div>`;
    case "Image":
      return p.url
        ? `<img src="${p.url}" alt="${esc(p.alt)}" style="width:${p.width}; display:block; margin:8px 0;" />`
        : `<div style="width:100%; height:120px; background:var(--color-ink-50); border:1px dashed var(--border-default); display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:12px; margin:8px 0;">Image placeholder</div>`;
    case "Button":
      return `<div style="padding:10px 0;"><span style="display:inline-block; padding:10px 20px; border-radius:6px; font-size:13px; font-weight:600; ${
        p.style === "Outline" ? "border:1px solid var(--color-primary-600); color:var(--color-primary-600);" : "background:var(--color-primary-600); color:#fff;"
      }">${esc(p.label)}</span></div>`;
    case "Divider":
      return `<hr style="border:none; border-top:1px solid var(--border-subtle); margin:12px 0;" />`;
    case "Spacer":
      return `<div style="height:${{ Small: "8px", Medium: "24px", Large: "48px" }[p.height] || "24px"};"></div>`;
    case "Columns":
      return `<div style="display:flex; gap:16px; padding:8px 0;"><div style="flex:1; font-size:13px;">${esc(p.left)}</div><div style="flex:1; font-size:13px;">${esc(p.right)}</div></div>`;
    case "Social":
      return `<div style="padding:8px 0; font-size:12px; color:var(--text-tertiary);">Social: ${esc(p.platforms)}</div>`;
    case "Footer":
      return `<div style="padding:12px 0; border-top:1px solid var(--border-subtle); font-size:11px; color:var(--text-tertiary); margin-top:12px;">${esc(p.text)}</div>`;
    default:
      return "";
  }
}
function blockPropsFieldsHTML(block) {
  const p = block.props;
  switch (block.type) {
    case "Header":
      return `<div class="field"><label class="field__label">Text</label><input class="input" type="text" data-block-prop="text" value="${esc(p.text)}" /></div>`;
    case "Text":
      return `
        <div class="field"><label class="field__label">Content</label><textarea class="input" rows="3" data-block-prop="text">${esc(p.text)}</textarea></div>
        <div class="event-form-grid">
          <div class="field"><label class="field__label">Alignment</label><div class="select select--sm"><select data-block-prop="align">${["left", "center", "right"].map((a) => `<option value="${a}" ${a === p.align ? "selected" : ""}>${a}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
          <div class="field"><label class="field__label">Size</label><div class="select select--sm"><select data-block-prop="size">${["Small", "Normal", "Large"].map((s) => `<option value="${s}" ${s === p.size ? "selected" : ""}>${s}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
          <div class="field"><label class="field__label">Color</label><input class="input" type="text" data-block-prop="color" value="${esc(p.color)}" placeholder="e.g. #1a1a1a" /></div>
        </div>`;
    case "Image":
      return `
        <div class="field"><label class="field__label">Image URL</label><input class="input" type="text" data-block-prop="url" value="${esc(p.url)}" placeholder="https://…" /></div>
        <div class="event-form-grid">
          <div class="field"><label class="field__label">Alt Text</label><input class="input" type="text" data-block-prop="alt" value="${esc(p.alt)}" /></div>
          <div class="field"><label class="field__label">Width</label><input class="input" type="text" data-block-prop="width" value="${esc(p.width)}" /></div>
          <div class="field field--full"><label class="field__label">Link</label><input class="input" type="text" data-block-prop="link" value="${esc(p.link)}" /></div>
        </div>`;
    case "Button":
      return `
        <div class="event-form-grid">
          <div class="field"><label class="field__label">Label</label><input class="input" type="text" data-block-prop="label" value="${esc(p.label)}" /></div>
          <div class="field"><label class="field__label">Link</label><input class="input" type="text" data-block-prop="link" value="${esc(p.link)}" /></div>
          <div class="field"><label class="field__label">Style</label><div class="select select--sm"><select data-block-prop="style">${["Primary", "Outline"].map((s) => `<option value="${s}" ${s === p.style ? "selected" : ""}>${s}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
        </div>`;
    case "Spacer":
      return `<div class="field"><label class="field__label">Height</label><div class="select select--sm"><select data-block-prop="height">${["Small", "Medium", "Large"].map((s) => `<option value="${s}" ${s === p.height ? "selected" : ""}>${s}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>`;
    case "Columns":
      return `<div class="event-form-grid"><div class="field"><label class="field__label">Left</label><input class="input" type="text" data-block-prop="left" value="${esc(p.left)}" /></div><div class="field"><label class="field__label">Right</label><input class="input" type="text" data-block-prop="right" value="${esc(p.right)}" /></div></div>`;
    case "Social":
      return `<div class="field"><label class="field__label">Platforms</label><input class="input" type="text" data-block-prop="platforms" value="${esc(p.platforms)}" /></div>`;
    case "Footer":
      return `<div class="field"><label class="field__label">Footer Text</label><input class="input" type="text" data-block-prop="text" value="${esc(p.text)}" /></div>`;
    default:
      return `<p class="event-empty-note">No editable properties for this block.</p>`;
  }
}
function generateHtmlFromBlocks(blocks) {
  const inner = blocks.map((b) => blockPreviewHTML(b)).join("\n");
  return `<div style="max-width:640px; margin:0 auto; font-family:sans-serif;">\n${inner}\n</div>`;
}
function renderBlockCanvas(blocks, mountSelector) {
  const mount = document.querySelector(mountSelector);
  if (!mount) return;
  mount.innerHTML = blocks.length
    ? blocks
        .map(
          (b) => `<div class="event-stream-card" draggable="true" data-block-id="${b.id}" style="cursor:grab; margin-bottom:8px; padding:8px 12px; ${b.id === selectedBlockId ? "border-color: var(--color-primary-500);" : ""}">
          <div class="cluster gap-2" style="justify-content: space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:600; color:var(--text-tertiary); text-transform:uppercase;"><i data-lucide="grip-vertical" style="width:12px;height:12px;vertical-align:-2px;"></i> ${b.type}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-block-remove="${b.id}" aria-label="Remove block"><i data-lucide="x"></i></button>
          </div>
          ${blockPreviewHTML(b)}
        </div>`
        )
        .join("")
    : `<p class="table__empty">No blocks yet — add one from the palette above.</p>`;
  refreshIcons();
}

/* ================================================================ */
/* Channel-specific editor markup                                     */
/* ================================================================ */
function paletteHTML(types) {
  return `<div class="cluster gap-2" data-block-palette style="flex-wrap: wrap; margin-bottom: var(--space-3);">${types
    .map((t) => `<button type="button" class="btn btn--outline btn--sm" data-add-block="${t}">+ ${t}</button>`)
    .join("")}</div>`;
}
function channelFieldsHTML(channel, data) {
  if (channel === "Email") {
    ensureEmailBlocks(data);
    return `
      <div class="event-form-grid" style="margin-bottom: var(--space-4);">
        <div class="field"><label class="field__label">Subject</label><input class="input" type="text" data-field="subject" value="${esc(data.subject)}" /></div>
        <div class="field"><label class="field__label">Preview Text</label><input class="input" type="text" data-field="previewText" value="${esc(data.previewText)}" /></div>
      </div>
      <div class="event-form-error" data-error-channel hidden></div>
      <div class="tabs tabs--pill" role="tablist" aria-label="Editor mode" data-email-mode-tabs style="margin-bottom: var(--space-3);">
        <button type="button" class="tabs__tab" data-email-mode="design" aria-selected="${!codeMode}">Design</button>
        <button type="button" class="tabs__tab" data-email-mode="code" aria-selected="${codeMode}">Code</button>
      </div>
      <div data-email-design ${codeMode ? "hidden" : ""}>
        ${paletteHTML(EMAIL_BLOCK_TYPES)}
        <div data-block-canvas style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3); max-width: 640px;"></div>
        <div data-block-properties style="margin-top: var(--space-4);"></div>
      </div>
      <div data-email-code ${codeMode ? "" : "hidden"}>
        <textarea class="input font-mono" rows="14" data-html-code style="font-size:12px;">${esc(generateHtmlFromBlocks(data.blocks))}</textarea>
        <p class="event-empty-note" style="margin-top: var(--space-2);">Code preview is generated from the current blocks. Editing here previews custom HTML — switching back to Design continues from the block structure.</p>
      </div>`;
  }
  if (channel === "Push") {
    return `
      <div class="field"><label class="field__label">Title</label><input class="input" type="text" data-ch-field="title" value="${esc(data.title)}" /></div>
      <div class="field"><label class="field__label">Body</label><textarea class="input" rows="3" data-ch-field="body">${esc(data.body)}</textarea></div>
      <div class="field"><label class="field__label">Image (optional)</label><input class="input" type="text" data-ch-field="image" value="${esc(data.image)}" placeholder="Image URL" /></div>
      <div class="field"><label class="field__label">Deep Link</label><input class="input" type="text" data-ch-field="deepLink" value="${esc(data.deepLink)}" placeholder="/trading" /></div>
      <div class="field"><label class="field__label">CTA / Action</label><input class="input" type="text" data-ch-field="cta" value="${esc(data.cta)}" placeholder="e.g. Open Trading" /></div>
      <div class="event-form-error" data-error-channel hidden></div>`;
  }
  if (channel === "SMS") {
    const len = (data.message || "").length;
    return `
      <div class="field"><label class="field__label">Message</label><textarea class="input" rows="4" data-ch-field="message">${esc(data.message)}</textarea></div>
      <p class="event-empty-note" data-sms-count>${len} characters</p>
      <div class="event-form-error" data-error-channel hidden></div>`;
  }
  if (channel === "Zalo") {
    return `
      <div class="field"><label class="field__label">Title</label><input class="input" type="text" data-ch-field="title" value="${esc(data.title)}" /></div>
      <div class="field"><label class="field__label">Message</label><textarea class="input" rows="4" data-ch-field="message">${esc(data.message)}</textarea></div>
      <div class="field"><label class="field__label">Image (optional)</label><input class="input" type="text" data-ch-field="image" value="${esc(data.image)}" placeholder="Image URL" /></div>
      <div class="field"><label class="field__label">CTA Label</label><input class="input" type="text" data-ch-field="ctaLabel" value="${esc(data.ctaLabel)}" /></div>
      <div class="field"><label class="field__label">CTA Link</label><input class="input" type="text" data-ch-field="ctaLink" value="${esc(data.ctaLink)}" /></div>
      <div class="event-form-error" data-error-channel hidden></div>`;
  }
  if (channel === "Web Message" || channel === "In-App") {
    const templates = channel === "Web Message" ? WEB_MESSAGE_TEMPLATES : IN_APP_TEMPLATES;
    if (!data.elements) data.elements = [];
    return `
      <div class="field" style="margin-bottom: var(--space-4);"><label class="field__label">Template</label>
        <div class="select select--sm"><select data-ch-field="template">${templates.map((t) => `<option value="${t}" ${t === data.template ? "selected" : ""}>${t}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      <div class="event-form-error" data-error-channel hidden></div>
      ${paletteHTML(LAYOUT_BLOCK_TYPES)}
      <div data-block-canvas style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3);"></div>
      <div data-block-properties style="margin-top: var(--space-4);"></div>`;
  }
  return "";
}
function readChannelFields(channel, body) {
  const data = {};
  body.querySelectorAll("[data-field]").forEach((el) => (data[el.dataset.field] = el.value));
  body.querySelectorAll("[data-ch-field]").forEach((el) => (data[el.dataset.chField] = el.value));
  return data;
}
function currentDraft(channel) {
  const key = channelFieldKey(channel);
  return draftChannelData[key] || (draftChannelData[key] = {});
}

function renderChannelEditor() {
  const channel = document.querySelector("[data-field-channel]").value;
  const body = document.querySelector("[data-channel-editor-body]");
  document.querySelector("[data-channel-editor-title]").textContent = channel;
  const data = currentDraft(channel);
  body.innerHTML = channelFieldsHTML(channel, data);

  document.querySelector("[data-variable-chips]").innerHTML = CONTENT_VARIABLES.map((v) => `<span class="badge badge--neutral font-mono" data-var-chip="${v}" style="cursor: pointer;">${v}</span>`).join("");
  document.querySelectorAll("[data-var-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const target = body.querySelector("textarea[data-ch-field], textarea[data-field], textarea[data-block-prop]") || body.querySelector("input[data-ch-field], input[data-field]");
      if (target) {
        target.value += (target.value ? " " : "") + chip.dataset.varChip;
        target.dispatchEvent(new Event("input"));
      }
    });
  });

  body.querySelectorAll("[data-field], [data-ch-field]").forEach((el) => {
    el.addEventListener("input", () => {
      const key = el.dataset.field || el.dataset.chField;
      data[key] = el.value;
      if (channel === "SMS" && key === "message") {
        const countEl = body.querySelector("[data-sms-count]");
        if (countEl) countEl.textContent = `${el.value.length} characters`;
      }
      renderPreview();
    });
  });

  // Block-based editors (Email / Web Message / In-App)
  if (channel === "Email" || channel === "Web Message" || channel === "In-App") {
    const blocks = channel === "Email" ? data.blocks : data.elements;
    const canvasSelector = "[data-block-canvas]";
    renderBlockCanvas(blocks, canvasSelector);
    wireBlockCanvas(blocks, canvasSelector);
    renderBlockProperties(blocks);

    body.querySelectorAll("[data-add-block]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.addBlock;
        const block = { id: uid(), type, props: defaultBlockProps(type) };
        blocks.push(block);
        selectedBlockId = block.id;
        renderBlockCanvas(blocks, canvasSelector);
        wireBlockCanvas(blocks, canvasSelector);
        renderBlockProperties(blocks);
        renderPreview();
      });
    });
    body.querySelector("[data-email-mode-tabs]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-email-mode]");
      if (!btn) return;
      codeMode = btn.dataset.emailMode === "code";
      renderChannelEditor();
    });
    body.querySelector("[data-html-code]")?.addEventListener("input", renderPreview);
  }

  refreshIcons();
  renderPreview();
}
function wireBlockCanvas(blocks, canvasSelector) {
  const canvas = document.querySelector(canvasSelector);
  if (!canvas) return;
  canvas.querySelectorAll("[data-block-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-block-remove]")) return;
      selectedBlockId = el.dataset.blockId;
      renderBlockCanvas(blocks, canvasSelector);
      wireBlockCanvas(blocks, canvasSelector);
      renderBlockProperties(blocks);
    });
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.blockId);
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      const fromIdx = blocks.findIndex((b) => b.id === draggedId);
      const toIdx = blocks.findIndex((b) => b.id === el.dataset.blockId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const [moved] = blocks.splice(fromIdx, 1);
      blocks.splice(toIdx, 0, moved);
      renderBlockCanvas(blocks, canvasSelector);
      wireBlockCanvas(blocks, canvasSelector);
      renderPreview();
    });
    el.querySelector("[data-block-remove]")?.addEventListener("click", () => {
      const idx = blocks.findIndex((b) => b.id === el.dataset.blockId);
      if (idx !== -1) blocks.splice(idx, 1);
      if (selectedBlockId === el.dataset.blockId) selectedBlockId = null;
      renderBlockCanvas(blocks, canvasSelector);
      wireBlockCanvas(blocks, canvasSelector);
      renderBlockProperties(blocks);
      renderPreview();
    });
  });
}
function renderBlockProperties(blocks) {
  const mount = document.querySelector("[data-block-properties]");
  if (!mount) return;
  const block = blocks.find((b) => b.id === selectedBlockId);
  if (!block) {
    mount.innerHTML = `<p class="event-empty-note">Select a block to edit its properties.</p>`;
    return;
  }
  mount.innerHTML = `<div class="section__header" style="padding:0; margin-bottom: var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">${block.type} Properties</h3></div>${blockPropsFieldsHTML(block)}`;
  mount.querySelectorAll("[data-block-prop]").forEach((el) => {
    el.addEventListener("input", () => {
      block.props[el.dataset.blockProp] = el.value;
      const canvasSelector = "[data-block-canvas]";
      renderBlockCanvas(blocks, canvasSelector);
      wireBlockCanvas(blocks, canvasSelector);
      renderPreview();
    });
  });
  refreshIcons();
}

/* ================================================================ */
/* Preview — approximate rendering per channel.                       */
/* ================================================================ */
function renderPreview() {
  const channel = document.querySelector("[data-field-channel]").value;
  const data = currentDraft(channel);
  const mount = document.querySelector("[data-content-preview]");

  if (channel === "Email") {
    const html = codeMode ? document.querySelector("[data-html-code]")?.value || "" : generateHtmlFromBlocks(ensureEmailBlocks(data));
    mount.innerHTML = `
      <div class="cluster gap-2" style="margin-bottom: var(--space-3);">
        <button type="button" class="btn btn--ghost btn--sm is-active" data-preview-device="desktop">Desktop</button>
        <button type="button" class="btn btn--ghost btn--sm" data-preview-device="mobile">Mobile</button>
      </div>
      <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden;" data-email-preview-frame>
        <div style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-subtle); background: var(--color-ink-50);">
          <div style="font-size: var(--text-xs); color: var(--text-tertiary);">Subject</div>
          <div style="font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-primary);">${esc(data.subject) || "—"}</div>
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">${esc(data.previewText) || ""}</div>
        </div>
        <div style="padding: var(--space-4);">${html}</div>
      </div>`;
    mount.querySelectorAll("[data-preview-device]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mount.querySelectorAll("[data-preview-device]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const frame = mount.querySelector("[data-email-preview-frame]");
        frame.style.maxWidth = btn.dataset.previewDevice === "mobile" ? "320px" : "640px";
      });
    });
  } else if (channel === "Push") {
    mount.innerHTML = `
      <div class="cluster gap-2" style="margin-bottom: var(--space-3);">
        <button type="button" class="btn btn--ghost btn--sm is-active" data-push-os="ios">iOS</button>
        <button type="button" class="btn btn--ghost btn--sm" data-push-os="android">Android</button>
      </div>
      <div style="border: 1px solid var(--border-subtle); border-radius: 14px; padding: var(--space-3); max-width: 320px; background: var(--surface-panel);">
        <div class="cluster gap-2" style="align-items: center; margin-bottom: 4px;"><i data-lucide="bell" style="width:14px;height:14px;color: var(--text-tertiary);"></i><span style="font-size: 11px; color: var(--text-tertiary);">PHS CDP · now</span></div>
        <div style="font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-primary);">${esc(data.title) || "—"}</div>
        <div style="font-size: var(--text-sm); color: var(--text-secondary);">${esc(data.body) || "—"}</div>
        ${data.image ? `<img src="${data.image}" style="width:100%; border-radius:8px; margin-top:6px;" />` : ""}
        <div class="font-mono" style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">${esc(data.deepLink) || ""}</div>
        ${data.cta ? `<div style="margin-top:6px; font-size:12px; font-weight:600; color: var(--color-primary-600);">${esc(data.cta)}</div>` : ""}
      </div>`;
  } else if (channel === "SMS") {
    mount.innerHTML = `
      <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3); max-width: 280px; background: var(--color-ink-50); font-size: var(--text-sm); color: var(--text-primary); white-space: pre-wrap;">${esc(data.message) || "—"}</div>`;
  } else if (channel === "Zalo") {
    mount.innerHTML = `
      <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3); max-width: 320px; background: var(--surface-panel);">
        ${data.title ? `<div style="font-size: var(--text-sm); font-weight: var(--weight-semibold); margin-bottom:4px;">${esc(data.title)}</div>` : ""}
        ${data.image ? `<img src="${data.image}" style="width:100%; border-radius:6px; margin-bottom:6px;" />` : ""}
        <div style="font-size: var(--text-sm); color: var(--text-primary); white-space: pre-wrap;">${esc(data.message) || "—"}</div>
        ${data.ctaLabel ? `<button class="btn btn--primary btn--sm" style="margin-top: var(--space-3); width: 100%;" disabled>${esc(data.ctaLabel)}</button>` : ""}
      </div>`;
  } else if (channel === "Web Message") {
    const elementsHtml = (data.elements || []).map(blockPreviewHTML).join("");
    mount.innerHTML = `
      <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow:hidden;">
        <div style="background: var(--color-ink-50); padding: 6px 10px; font-size: 10px; color: var(--text-tertiary); border-bottom: 1px solid var(--border-subtle);">phs.com.vn</div>
        <div style="padding: var(--space-4); min-height: 120px; position: relative; background: repeating-linear-gradient(45deg, var(--color-ink-50), var(--color-ink-50) 10px, var(--surface-panel) 10px, var(--surface-panel) 20px);">
          <div style="max-width: 260px; background: var(--surface-panel); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3); box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
            <div style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">${esc(data.template) || "Banner"}</div>
            ${elementsHtml || '<p class="event-empty-note">No elements yet.</p>'}
          </div>
        </div>
      </div>`;
  } else if (channel === "In-App") {
    const elementsHtml = (data.elements || []).map(blockPreviewHTML).join("");
    mount.innerHTML = `
      <div style="border: 1px solid var(--border-subtle); border-radius: 20px; padding: 8px; max-width: 240px; margin: 0 auto; background: var(--color-ink-900, #111);">
        <div style="background: var(--surface-panel); border-radius: 14px; min-height: 360px; padding: var(--space-3); position: relative;">
          <div style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 8px;">${esc(data.template) || "Banner"}</div>
          ${elementsHtml || '<p class="event-empty-note">No elements yet.</p>'}
        </div>
      </div>`;
  }
  refreshIcons();
}

function validateChannelData(channel, data) {
  if (channel === "Email") return data.subject?.trim() && (data.blocks || []).length ? null : "Subject and at least one block are required.";
  if (channel === "Push") return data.title?.trim() && data.body?.trim() ? null : "Title and Body are required.";
  if (channel === "SMS") return data.message?.trim() ? null : "Message is required.";
  if (channel === "Zalo") return data.message?.trim() ? null : "Message is required.";
  if (channel === "Web Message" || channel === "In-App") return (data.elements || []).length ? null : "Add at least one element.";
  return null;
}

function renderVersions(content) {
  const section = document.querySelector("[data-version-section]");
  if (!content) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.querySelector("[data-version-table]").innerHTML = content.versions
    .map((v) => `<tr><td class="cell-primary font-mono">${v.version}</td><td class="cell-muted tabular-nums">${v.updatedAt}</td><td>${statusBadge(v.status)}</td></tr>`)
    .join("");
}
function renderUsage(content) {
  const section = document.querySelector("[data-usage-section]");
  if (!content) {
    section.hidden = true;
    return;
  }
  const usedBy = CAMPAIGNS.filter((c) => c.templateIds.includes(content.id));
  section.hidden = false;
  document.querySelector("[data-usage-body]").innerHTML = usedBy.length
    ? `<div class="stack gap-2">${usedBy.map((c) => `<a href="campaigns.html?open=${c.id}" class="identity-row" style="text-decoration:none;"><div class="identity-row__main"><span class="identity-row__label">${c.goal}</span><span style="font-size: var(--text-sm); color: var(--text-primary);">${c.name} <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></span></div></a>`).join("")}</div>`
    : `<p class="event-empty-note">Not currently used by any campaign.</p>`;
  refreshIcons();
}

function openEditor(id, presetChannel) {
  editingId = id || null;
  const content = id ? getContentById(id) : null;
  draftChannelData = {};
  selectedBlockId = null;
  codeMode = false;
  if (content) {
    const key = channelFieldKey(content.channel);
    draftChannelData[key] = JSON.parse(JSON.stringify(content[key] || {}));
  }

  document.querySelector("[data-editor-title]").textContent = content ? content.name : "New Content";
  document.querySelector("[data-editor-version-badge]").innerHTML = content ? `<span class="badge badge--neutral font-mono">${content.version}</span>` : "";
  document.querySelector("[data-content-duplicate]").hidden = !content;
  document.querySelector("[data-field-name]").value = content?.name || "";
  document.querySelector("[data-field-description]").value = content?.description || "";

  const channelSelect = document.querySelector("[data-field-channel]");
  channelSelect.innerHTML = CONTENT_CHANNELS.map((c) => `<option value="${c}" ${c === (content?.channel || presetChannel) ? "selected" : ""}>${c}</option>`).join("");
  const statusSelect = document.querySelector("[data-field-status]");
  statusSelect.innerHTML = CONTENT_STATUSES.map((s) => `<option value="${s}" ${s === content?.status ? "selected" : ""}>${s}</option>`).join("");

  document.querySelector("[data-error-name]").hidden = true;

  renderChannelEditor();
  renderVersions(content);
  renderUsage(content);
  showView("editor");
  history.replaceState(null, "", content ? `content.html?open=${content.id}` : "content.html#create");
}

function collectAndValidate() {
  const name = document.querySelector("[data-field-name]").value.trim();
  const channel = document.querySelector("[data-field-channel]").value;
  const body = document.querySelector("[data-channel-editor-body]");
  const nameError = document.querySelector("[data-error-name]");
  const channelError = document.querySelector("[data-error-channel]");
  nameError.hidden = true;
  if (channelError) channelError.hidden = true;

  if (!name) {
    nameError.textContent = "Content Name is required.";
    nameError.hidden = false;
    return null;
  }
  const channelData = readChannelFields(channel, body);
  const data = { ...currentDraft(channel), ...channelData };
  const err = validateChannelData(channel, data);
  if (err) {
    if (channelError) {
      channelError.textContent = err;
      channelError.hidden = false;
    }
    return null;
  }
  return {
    name,
    channel,
    description: document.querySelector("[data-field-description]").value.trim(),
    status: document.querySelector("[data-field-status]").value,
    [channelFieldKey(channel)]: data,
  };
}

function initEditorActions() {
  document.querySelector("[data-field-channel]").addEventListener("change", () => {
    selectedBlockId = null;
    codeMode = false;
    renderChannelEditor();
  });
  document.querySelector("[data-back-to-list]").addEventListener("click", () => {
    showView("list");
    history.replaceState(null, "", "content.html");
  });
  document.querySelector("[data-create-content]").addEventListener("click", () => openEditor(null));

  document.querySelector("[data-content-save-draft]").addEventListener("click", () => {
    const values = collectAndValidate();
    if (!values) return;
    saveContent({ ...values, status: "Draft" });
  });
  document.querySelector("[data-content-publish]").addEventListener("click", () => {
    const values = collectAndValidate();
    if (!values) return;
    saveContent({ ...values, status: "Active" });
  });
  document.querySelector("[data-content-duplicate]").addEventListener("click", () => {
    if (!editingId) return;
    const copy = duplicateContent(editingId);
    renderList();
    openEditor(copy.id);
  });
}
function saveContent(values) {
  if (editingId) {
    updateContent(editingId, values);
  } else {
    const created = addContent(values);
    editingId = created.id;
  }
  renderList();
  openEditor(editingId);
}

export function initContent() {
  renderList();
  initSearchAndFilter();
  initEditorActions();

  const params = new URLSearchParams(location.search);
  const openId = params.get("open");
  const presetChannel = params.get("channel");
  if (openId && getContentById(openId)) {
    openEditor(openId);
  } else if (location.hash === "#create" || presetChannel) {
    openEditor(null, presetChannel);
  }
  refreshIcons();
}
