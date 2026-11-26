const styles = new WeakMap<Document, CSSStyleSheet>();

export function ensurePlaceholderStyle(document: Document) {
	let style = styles.get(document);
	if (!style) {
		style = new document.defaultView!.CSSStyleSheet();
		style.replaceSync(`.ProseMirror[aria-multiline="false"] {
  white-space: pre;
  overflow-x: auto;
}
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  position: absolute;
  pointer-events: none;
}`);
		styles.set(document, style);
	}

	if (!document.adoptedStyleSheets.includes(style)) {
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
	}
}
