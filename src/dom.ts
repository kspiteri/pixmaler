// Tiny DOM helpers — typed shorthand for createElement that lets views read
// closer to HTML: `el("div", { class: "row" }, [child1, child2])`.

type Tag = keyof HTMLElementTagNameMap;
type Child = Node | string | null | false | undefined;

interface Attrs {
  class?: string;
  id?: string;
  type?: string;
  href?: string;
  for?: string;
  placeholder?: string;
  value?: string | number;
  min?: string | number;
  max?: string | number;
  accept?: string;
  title?: string;
  text?: string;
  html?: string;
  disabled?: boolean;
  // Anything else (e.g. data-*, custom). Kept loose on purpose.
  [key: string]: unknown;
}

export function el<K extends Tag>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = String(value);
    else if (key === "for" && node instanceof HTMLLabelElement) node.htmlFor = String(value);
    else if (key === "disabled") (node as HTMLButtonElement | HTMLInputElement).disabled = Boolean(value);
    else node.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  return node;
}

// Convenience for plain text nodes inside `el()` children arrays.
export function text(value: string): Text {
  return document.createTextNode(value);
}

// Replace the contents of `host` with the given children. Common pattern for
// view rendering — prevents stale event listeners from outliving the render.
export function mount(host: HTMLElement, child: Node) {
  host.replaceChildren(child);
}
