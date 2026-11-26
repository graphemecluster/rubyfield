import { EditorContent, useEditor } from "@tiptap/vue-3";
import { defineComponent, h, watch } from "vue";

import type { Annotate, AnnotationBehaviorOptions, Attributes, RubyfieldHandle, RubyfieldOptions, RubyOptions } from "rubyfield";
import { BindingSession } from "rubyfield/session";

import type { ComponentOptionsMixin, DefineComponent, PropType } from "vue";

export type { Annotate, Annotation, AnnotationBehaviorOptions, Attributes, ElementOptions, RPElementOptions, RubyfieldHandle, RubyfieldOptions, RubyOptions } from "rubyfield";
export { segmentsToRanges } from "rubyfield";

/** Plain-text field with live, read-only ruby annotations and a ref exposing RubyfieldHandle. */
export const Rubyfield: DefineComponent<Omit<RubyfieldOptions, "onUpdate">, {}, {}, {}, {}, ComponentOptionsMixin, ComponentOptionsMixin, { "update:content": (content: string) => true }> = defineComponent({
	name: "Rubyfield",

	// Forward native props through Vue; attributes explicitly target the editable element.
	inheritAttrs: false,
	props: {
		annotate: { type: Function as PropType<Annotate>, required: true },
		annotationBehavior: Object as PropType<AnnotationBehaviorOptions>,
		content: String,
		defaultContent: String,
		ruby: Object as PropType<RubyOptions>,
		attributes: Object as PropType<Attributes>,
		multiline: { type: Boolean, default: true },
		readOnly: Boolean,
		disabled: Boolean,
		placeholder: String,
		autoFocus: Boolean,
	},
	emits: { "update:content": (_content: string) => true },
	setup(props, { attrs, emit, expose }) {
		const options = () => ({
			annotate: props.annotate,
			annotationBehavior: props.annotationBehavior,
			content: props.content,
			defaultContent: props.defaultContent,
			ruby: props.ruby,
			attributes: props.attributes,
			multiline: props.multiline,
			readOnly: props.readOnly,
			disabled: props.disabled,
			placeholder: props.placeholder,
			autoFocus: props.autoFocus,
			onUpdate: (content: string) => emit("update:content", content),
		});

		const session = new BindingSession(options());
		const editor = useEditor(session.createOptions());

		// Track props rather than editor state, or edits can reapply stale controlled text.
		watch(() => [editor.value, options()] as const, ([editor, next]) => {
			if (editor) {
				session.attach(editor);
				session.setOptions(next);
			}
		}, { immediate: true, deep: true });

		expose(session.handle);

		return () => h(EditorContent, {
			editor: editor.value,
			...attrs,
		});
	},
});
