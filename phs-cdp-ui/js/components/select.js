/**
 * Wires up `.segmented` controls (the exclusive-choice alternative to
 * a native <select>). Markup contract:
 *   <div class="segmented" role="tablist">
 *     <button class="segmented__option" aria-selected="true">A</button>
 *     ...
 *   </div>
 */
export function initSegmented(root) {
  const options = Array.from(root.querySelectorAll(".segmented__option"));
  options.forEach((option) => {
    option.addEventListener("click", () => {
      options.forEach((o) => o.setAttribute("aria-selected", String(o === option)));
    });
  });
}

export function initAllSegmented(root = document) {
  root.querySelectorAll(".segmented").forEach(initSegmented);
}
