import { Editor } from "@tiptap/core";

import { BindingSession } from "./session";

import type { Rubyfield, RubyfieldOptions } from "./types";

export { segmentsToRanges } from "./text";
export type { Annotate, Annotation, AnnotationBehaviorOptions, Attributes, ElementOptions, RPElementOptions, Rubyfield, RubyfieldHandle, RubyfieldOptions, RubyOptions } from "./types";

/** Mount a plain-text field with live, read-only ruby annotations in a DOM container. */
export function createRubyfield(element: HTMLElement, options: RubyfieldOptions): Rubyfield {
	const session = new BindingSession(options);
	const editor = new Editor({ ...session.createOptions(), element });
	session.attach(editor);

	// Keep the getter descriptors on the public handle.
	return Object.assign(session.handle, {
		setOptions: (next: Partial<Omit<RubyfieldOptions, "multiline">>) => session.setOptions(next),
		destroy: () => session.destroy(),
	});
}
