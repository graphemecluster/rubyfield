import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

import { refreshKey } from "./ruby";
import { documentText, validateAnnotations } from "./text";

import type { Node } from "@tiptap/pm/model";
import type { Annotate, Annotation, RubyfieldOptions } from "./types";

const key = new PluginKey("rubyfieldAnnotation");

export function createAnnotationExtension(getOptions: () => RubyfieldOptions, onCompositionEnd: () => void) {
	return Extension.create({
		name: "rubyfieldAnnotation",
		onCreate() {
			// Annotate the initial content too.
			this.editor.view.dispatch(this.editor.state.tr.setMeta(refreshKey, true));
		},

		addProseMirrorPlugins() {
			const editor = this.editor;
			let composing = false;
			let cachedAnnotate: Annotate | undefined;
			let cachedMode: string | undefined;
			let cachedScope: string | undefined;
			let cache = new Map<string, readonly Annotation[]>();
			let annotatedParagraphs = new WeakMap<Node, readonly Annotation[]>();
			let timer: ReturnType<typeof setTimeout> | undefined;
			let start: { position: number; text: string } | undefined;

			function report(error: unknown) {
				const handler = getOptions().annotationBehavior?.onError;
				// Throw only after dispatch returns so annotation failures cannot abort input.
				queueMicrotask(() => {
					if (handler) handler(error);
					else throw error;
				});
			}

			return [new Plugin({
				key,
				props: {
					handleDOMEvents: {
						compositionstart(view) {
							clearTimeout(timer);
							composing = true;
							start = view.state.selection.empty ? { position: view.state.selection.from, text: documentText(view.state.doc) } : undefined;
							return false;
						},

						compositionend(view, event) {
							// Keep the final input/DOM flush protected too. ProseMirror must
							// finish reading the committed text before we rewrite its marks.
							timer = setTimeout(() => {
								composing = false;
								if (view.isDestroyed) return;

								const tr = view.state.tr.setMeta(refreshKey, true);

								// If provisional text was erased, restore the pre-composition
								// caret rather than accepting a position from a removed node.
								if (event.data === "" && start && documentText(tr.doc) === start.text) {
									tr.setSelection(TextSelection.create(tr.doc, Math.min(start.position, tr.doc.content.size - 1)));
								}
								view.dispatch(tr);
								start = undefined;

								// Canceling composition after a ruby can remove the browser's
								// range while leaving ProseMirror's selection intact.
								const selection = view.dom.ownerDocument.getSelection();
								if (view.hasFocus() && (!selection?.rangeCount || selection.focusNode === view.dom)) view.focus();

								onCompositionEnd();
							}, 0);
							return false;
						},
					},
				},

				view() {
					return {
						destroy() {
							clearTimeout(timer);
						},
					};
				},

				appendTransaction(transactions, _oldState, state) {
					// Rebuilding ruby around provisional text interrupts the browser's IME.
					if (composing || editor.view.composing) return null;

					// Ignore our own mark-only transaction so annotation does not recurse.
					if (!transactions.some(tr => (tr.docChanged && !tr.getMeta(key)) || tr.getMeta(refreshKey))) return null;

					const { annotate, annotationBehavior } = getOptions();
					const mode = annotationBehavior?.validation ?? "lenient";
					const scope = annotationBehavior?.scope ?? "line";
					if (annotate !== cachedAnnotate || mode !== cachedMode || scope !== cachedScope) {
						cache.clear();
						annotatedParagraphs = new WeakMap();
					}
					cachedAnnotate = annotate;
					cachedMode = mode;
					cachedScope = scope;
					const nextCache = new Map<string, readonly Annotation[]>();

					function annotationsFor(text: string) {
						const cached = nextCache.get(text) ?? cache.get(text);
						if (cached) {
							nextCache.set(text, cached);
							return cached;
						}
						let annotations: readonly Annotation[] = [];
						try {
							const result = validateAnnotations(text, annotate(text), mode);
							annotations = result.annotations;
							if (result.errors.length) report(new AggregateError(result.errors, result.errors.map(error => error.message).join("\n")));
						}
						catch (error) {
							report(error);
						}
						nextCache.set(text, annotations);
						return annotations;
					}

					const ruby = state.schema.marks.rubyText;
					const tr = state.tr;
					if (scope === "line") {
						// Immutable nodes retain their marks when other paragraphs change or move.
						state.doc.forEach((paragraph, pos) => {
							const previous = annotatedParagraphs.get(paragraph);
							if (previous) {
								nextCache.set(paragraph.textContent, previous);
								return;
							}
							tr.removeMark(pos + 1, pos + 1 + paragraph.content.size, ruby);
							for (const [from, to, rubyText] of annotationsFor(paragraph.textContent)) {
								if (rubyText) tr.addMark(pos + 1 + from, pos + 1 + to, ruby.create({ rt: rubyText, annotationId: `${from}:${to}` }));
							}
						});
						tr.doc.forEach(paragraph => annotatedParagraphs.set(paragraph, nextCache.get(paragraph.textContent)!));
					}
					else {
						tr.removeMark(0, state.doc.content.size, ruby);
						const annotations = annotationsFor(documentText(state.doc));
						// Whole-text ranges crossing newlines become separate ruby per paragraph.
						let offset = 0;
						state.doc.forEach((paragraph, pos) => {
							const end = offset + paragraph.content.size;
							for (const [from, to, rubyText] of annotations) {
								const a = Math.max(from, offset), b = Math.min(to, end);
								if (a < b && rubyText) tr.addMark(pos + 1 + a - offset, pos + 1 + b - offset, ruby.create({ rt: rubyText, annotationId: `${from}:${to}` }));
							}
							offset = end + 1;
						});
					}
					// Retain only current text so editing does not grow an unbounded cache.
					cache = nextCache;

					// Derived annotations should not create separate undo entries.
					return tr.setStoredMarks([]).setMeta(key, true).setMeta("addToHistory", false);
				},
			})];
		},
	});
}
