import type { Attributes } from "./types";

// Use the same attribute serialization in the live DOM and HTML export.
export function htmlAttributes(attributes: Attributes = {}): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attributes)
			.filter(([, value]) => value != null)
			.map(([name, value]) => [name, String(value)]),
	);
}

const previousAttributes = new WeakMap<HTMLElement, Set<string>>();

export function applyAttributes(element: HTMLElement, attributes: Attributes = {}) {
	const next = htmlAttributes(attributes);

	// Remove only attributes we own, leaving other editor-managed attributes alone.
	for (const name of previousAttributes.get(element) ?? []) {
		if (!Object.hasOwn(next, name)) element.removeAttribute(name);
	}

	for (const [name, value] of Object.entries(next)) {
		if (element.getAttribute(name) !== value) element.setAttribute(name, value);
	}

	previousAttributes.set(element, new Set(Object.keys(next)));
}
