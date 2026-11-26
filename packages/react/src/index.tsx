import { EditorContent, useEditor } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { RubyfieldHandle, RubyfieldOptions } from "rubyfield";
import { BindingSession } from "rubyfield/session";

import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from "react";

export type { Annotate, Annotation, AnnotationBehaviorOptions, Attributes, ElementOptions, RPElementOptions, RubyfieldHandle, RubyfieldOptions, RubyOptions } from "rubyfield";
export { segmentsToRanges } from "rubyfield";

type DOMProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "dangerouslySetInnerHTML" | "contentEditable" | "defaultValue" | "onChange" | "onChangeCapture">;

export type RubyfieldProps = RubyfieldOptions & DOMProps;

/** Plain-text field with live, read-only ruby annotations and a ref exposing RubyfieldHandle. */
export const Rubyfield: ForwardRefExoticComponent<RubyfieldProps & RefAttributes<RubyfieldHandle>> = forwardRef<RubyfieldHandle, RubyfieldProps>(function Rubyfield(props, ref) {
	const {
		annotate,
		annotationBehavior,
		content,
		defaultContent,
		onUpdate,
		ruby,
		attributes,
		multiline,
		readOnly,
		disabled,
		placeholder,
		autoFocus,
		...domProps
	} = props;
	const options: RubyfieldOptions = {
		annotate,
		annotationBehavior,
		content,
		defaultContent,
		onUpdate,
		ruby,
		attributes,
		multiline,
		readOnly,
		disabled,
		placeholder,
		autoFocus,
	};

	const sessionRef = useRef<BindingSession | null>(null);
	if (!sessionRef.current) sessionRef.current = new BindingSession(options);
	const session = sessionRef.current;

	// Keep extension instances stable; prop changes go through the shared session.
	const initialOptions = useRef<ReturnType<BindingSession["createOptions"]> | null>(null);
	if (!initialOptions.current) initialOptions.current = session.createOptions();

	// Server rendering must not construct an editor DOM before the component mounts.
	const editor = useEditor({ ...initialOptions.current, immediatelyRender: false });

	useImperativeHandle(ref, () => session.handle, [session]);
	useEffect(() => {
		if (editor) {
			session.attach(editor);
			session.setOptions(options);
		}
	});

	// React owns wrapper props; attributes explicitly target the editable element.
	return <EditorContent editor={editor} {...domProps} />;
});
