import { Editor, type EditorOptions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { createAnnotationExtension } from "./annotation";
import { htmlAttributes } from "./attributes";
import { ensurePlaceholderStyle } from "./placeholder-style";
import { createRubyExtension, refreshKey, rubyOptionsSignature } from "./ruby";
import { documentPosition, documentText, normalizeText, textDocument } from "./text";

import type { RubyfieldHandle, RubyfieldOptions } from "./types";

// Share option updates and input behavior across the core and framework bindings.
export class BindingSession {
	private editor: Editor | null = null;
	private config: RubyfieldOptions;
	private readonly multiline: boolean;
	private lastText: string;
	private pendingRefresh = false;
	private pendingContent: string | undefined;
	private rubySignature: string;
	private annotationSignature: string;
	readonly handle: RubyfieldHandle;

	constructor(options: RubyfieldOptions) {
		if (options.content !== undefined && options.defaultContent !== undefined) {
			throw new TypeError("Use either content or defaultContent, not both.");
		}

		this.config = options;
		this.multiline = options.multiline !== false;
		this.annotationSignature = JSON.stringify([options.annotationBehavior?.scope, options.annotationBehavior?.validation]);
		this.rubySignature = rubyOptionsSignature(options.ruby);
		this.lastText = normalizeText(options.content ?? options.defaultContent ?? "", this.multiline);

		// Getters keep refs current without exposing the underlying Tiptap instance.
		const self = this;
		this.handle = {
			get element() {
				return self.editor && !self.editor.isDestroyed ? self.editor.view.dom : null;
			},

			get value() {
				return self.editor && !self.editor.isDestroyed ? documentText(self.editor.state.doc) : self.lastText;
			},

			focus() {
				if (!self.config.disabled && self.editor && !self.editor.isDestroyed) self.editor.view.focus();
			},

			blur() {
				self.handle.element?.blur();
			},

			select() {
				self.handle.setSelectionRange(0, self.handle.value.length);
			},

			setSelectionRange(start, end) {
				const editor = self.editor;
				if (!editor || editor.isDestroyed || self.config.disabled) return;

				const a = documentPosition(editor.state.doc, Math.min(start, end));
				const b = documentPosition(editor.state.doc, end);
				editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, a, b)));
			},

			getHTML() {
				return self.editor && !self.editor.isDestroyed ? self.editor.getHTML() : "";
			},
		};
	}

	createOptions(): Partial<EditorOptions> {
		return {
			extensions: [
				this.multiline ? Document : Document.extend({ content: "paragraph" }),
				Paragraph,
				Text,
				UndoRedo,
				Placeholder.configure({
					placeholder: () => this.config.placeholder ?? "",
					showOnlyWhenEditable: false,
				}),
				createRubyExtension(() => this.config.ruby ?? {}),
				createAnnotationExtension(() => this.config, () => this.flushComposition()),
			],
			content: textDocument(this.lastText),
			editable: !this.config.readOnly && !this.config.disabled,
			onCreate: ({ editor }) => {
				this.attach(editor);
				if (this.config.autoFocus) this.handle.focus();
			},

			onUpdate: ({ editor }) => {
				const text = documentText(editor.state.doc);

				// Regenerating annotations must not report a base-text edit to the caller.
				if (text === this.lastText) return;
				this.lastText = text;
				this.config.onUpdate?.(text);
			},

			editorProps: {
				// ProseMirror owns root attribute updates, removals, and editor classes.
				attributes: () => htmlAttributes({
					...this.config.attributes,
					"role": "textbox",
					"aria-multiline": String(this.multiline),
					"aria-disabled": this.config.disabled ? "true" : undefined,
					"aria-readonly": this.config.readOnly ? "true" : undefined,
					"tabindex": this.config.disabled ? "-1" : (this.config.attributes?.tabindex ?? "0"),
				}),

				// Copy base text even though annotations are visible in the editor DOM.
				clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, "\n"),

				// Always use the plain-text clipboard representation.
				handlePaste: (view, event) => {
					event.preventDefault();
					const text = normalizeText(event.clipboardData?.getData("text/plain") ?? "", this.multiline);
					if (text) {
						const paragraphs = normalizeText(text).split("\n").map(line =>
							view.state.schema.nodes.paragraph.create(
								null,
								line ? view.state.schema.text(line) : undefined,
							)
						);
						view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(paragraphs), 1, 1)).scrollIntoView());
					}
					return true;
				},

				// Use ProseMirror's clipboard/drop hook to preserve text across paragraph boundaries.
				transformPasted: (slice, view) => {
					if (this.multiline) return slice;
					const text = normalizeText(slice.content.textBetween(0, slice.content.size, "\n"), false);
					return new Slice(text ? Fragment.from(view.state.schema.text(text)) : Fragment.empty, 0, 0);
				},

				// Keep file/image drops out of the document.
				handleDrop: (_view, event) => Boolean(event.dataTransfer?.files.length),
			},
		};
	}

	attach(editor: Editor) {
		this.editor = editor;
		ensurePlaceholderStyle(editor.view.dom.ownerDocument);
	}

	private setContent(text: string) {
		const editor = this.editor;
		const value = normalizeText(text, this.multiline);
		if (!editor || editor.isDestroyed || value === documentText(editor.state.doc)) return;

		// External updates must not replace the text node still owned by the IME.
		if (editor.view.composing) {
			this.pendingContent = value;
			return;
		}

		const selection = editor.state.selection;
		const oldStart = documentText(editor.state.doc.cut(0, selection.from)).length;
		this.lastText = value;

		// Prop updates are not user edits and must not echo through onUpdate.
		editor.commands.setContent(textDocument(value), { emitUpdate: false });
		const pos = documentPosition(editor.state.doc, oldStart);
		editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
	}

	setOptions(options: Partial<RubyfieldOptions>) {
		if ("multiline" in options && (options.multiline !== false) !== this.multiline) {
			throw new TypeError("multiline is fixed at creation; recreate or remount the field to change it.");
		}
		const previous = this.config;
		this.config = { ...previous, ...options };
		const editor = this.editor;
		if (!editor || editor.isDestroyed) return;

		if (previous.readOnly !== this.config.readOnly || previous.disabled !== this.config.disabled) {
			editor.setEditable(!this.config.readOnly && !this.config.disabled, false);
		}
		if (options.content !== undefined) this.setContent(options.content);
		if (previous.placeholder !== this.config.placeholder && !editor.view.composing) {
			editor.view.dispatch(editor.state.tr);
		}

		// Compare values to notice in-place reactive changes without refreshing on every render.
		const rubySignature = rubyOptionsSignature(this.config.ruby);
		const annotationSignature = JSON.stringify([this.config.annotationBehavior?.scope, this.config.annotationBehavior?.validation]);
		if (previous.annotate !== this.config.annotate || this.rubySignature !== rubySignature || this.annotationSignature !== annotationSignature) {
			this.annotationSignature = annotationSignature;
			this.rubySignature = rubySignature;
			if (editor.view.composing) this.pendingRefresh = true;
			else editor.view.dispatch(editor.state.tr.setMeta(refreshKey, "options"));
		}

		// Re-evaluate editorProps.attributes without creating a document edit.
		editor.view.setProps({});
	}

	private flushComposition() {
		if (this.pendingContent !== undefined) {
			const text = this.pendingContent;
			this.pendingContent = undefined;
			this.setContent(text);
		}

		if (this.pendingRefresh && this.editor && !this.editor.isDestroyed) {
			this.pendingRefresh = false;
			this.editor.view.dispatch(this.editor.state.tr.setMeta(refreshKey, "options"));
		}
	}

	destroy() {
		this.editor?.destroy();
		this.editor = null;
	}
}
