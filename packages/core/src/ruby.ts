import RubyText from "@tiptap/extension-ruby-text";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { applyAttributes, htmlAttributes } from "./attributes";

import type { DOMOutputSpec, Mark, Node } from "@tiptap/pm/model";
import type { Attributes, RubyOptions } from "./types";

export const refreshKey = "rubyfield:refresh";

// Compare rendered values, since raw attributes follow Tiptap's permissive type.
export function rubyOptionsSignature(options: RubyOptions = {}) {
	return JSON.stringify([
		htmlAttributes(options.attributes),
		htmlAttributes(options.rt?.attributes),
		options.rp?.before && [options.rp.before.text ?? "(", htmlAttributes(options.rp.before.attributes)],
		options.rp?.after && [options.rp.after.text ?? ")", htmlAttributes(options.rp.after.attributes)],
	]);
}

// Tiptap exposes attributes for <ruby>, but not for its generated <rt> widgets.
// This read-only variant replaces that widget plugin and the HTML serializer.
export function createRubyExtension(getOptions: () => RubyOptions) {
	return RubyText.extend({
		parseHTML() {
			return [
				...(this.parent?.() ?? []),
				{
					tag: "br",
					ignore: true,
					getAttrs: (node: HTMLElement) => {
						const ruby = node.nextSibling;
						if (ruby?.nodeName !== "RUBY" || !(ruby as HTMLElement).querySelector("rt")) return false;
						// Native splits can leave a placeholder BR before annotation-only
						// ruby, even when base text follows; that BR must not become a space.
						const text = node.ownerDocument.createTreeWalker(ruby, NodeFilter.SHOW_TEXT, {
							acceptNode: node => node.nodeValue && !node.parentElement?.closest("rt,rp") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
						});
						return text.nextNode() ? false : null;
					},
				},
			];
		},

		addAttributes() {
			return {
				rt: { default: null, rendered: false },

				// Distinct ranges may share annotation text; keep ProseMirror from merging them.
				annotationId: { default: null, rendered: false },
			};
		},

		renderHTML({ mark }): DOMOutputSpec {
			const { attributes, rt, rp } = getOptions();
			const children: DOMOutputSpec[] = [["rb", 0]];
			if (mark.attrs.rt != null) {
				if (rp?.before) children.push(["rp", htmlAttributes(rp.before.attributes), rp.before.text ?? "("]);
				children.push(["rt", htmlAttributes(rt?.attributes), mark.attrs.rt]);
				if (rp?.after) children.push(["rp", htmlAttributes(rp.after.attributes), rp.after.text ?? ")"]);
			}

			return ["ruby", htmlAttributes(attributes), ...children];
		},

		addMarkView() {
			return () => {
				const dom = document.createElement("ruby");
				applyAttributes(dom, getOptions().attributes);
				return { dom, contentDOM: dom };
			};
		},

		addProseMirrorPlugins() {
			const rubyType = this.type;
			let revision = 0;

			function decorations(doc: Node) {
				const { rt, rp } = getOptions();
				const ranges: { from: number; to: number; mark: Mark }[] = [];

				doc.descendants((node, pos) => {
					const mark = node.isText && node.marks.find(mark => mark.type === rubyType);
					if (!mark) return;

					const previous = ranges.at(-1);
					if (previous?.to === pos && previous.mark.eq(mark)) previous.to += node.nodeSize;
					else ranges.push({ from: pos, to: pos + node.nodeSize, mark });
				});

				// Ruby text and separators live in widgets so they never become editable text.
				return DecorationSet.create(
					doc,
					ranges.flatMap(({ from, to, mark }) => {
						function widget(tag: "rt" | "rp", text: string, attributes: Attributes | undefined, side: number) {
							return Decoration.widget(to, () => {
								const dom = document.createElement(tag);
								applyAttributes(dom, attributes);
								dom.contentEditable = "false";
								dom.textContent = text;
								return dom;
							}, { key: `rubyfield-${revision}-${from}-${to}-${side}-${text}`, marks: [mark], side });
						}
						return [
							...(rp?.before ? [widget("rp", rp.before.text ?? "(", rp.before.attributes, 1)] : []),
							widget("rt", mark.attrs.rt ?? "", rt?.attributes, 2),
							...(rp?.after ? [widget("rp", rp.after.text ?? ")", rp.after.attributes, 3)] : []),
						];
					}),
				);
			}

			return [new Plugin<DecorationSet>({
				state: {
					init: (_, state) => decorations(state.doc),
					apply(tr, previous) {
						// Attribute-only changes must invalidate cached widgets too.
						if (tr.getMeta(refreshKey) === "options") revision++;
						return tr.docChanged || tr.getMeta(refreshKey) ? decorations(tr.doc) : previous.map(tr.mapping, tr.doc);
					},
				},
				props: {
					decorations(state) {
						return this.getState(state);
					},
				},

				view(view) {
					return {
						update() {
							// Existing mark views can survive option changes; refresh their attributes.
							for (const ruby of view.dom.querySelectorAll("ruby")) applyAttributes(ruby, getOptions().attributes);
						},
					};
				},
			})];
		},
	});
}
