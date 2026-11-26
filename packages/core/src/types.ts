import type { RubyTextOptions } from "@tiptap/extension-ruby-text";

/** Ruby text for a half-open UTF-16 range in the supplied base text. */
export type Annotation = readonly [startIndex: number, endIndex: number, rubyText: string];
/** Pure function producing annotations for the supplied line or full text. */
export type Annotate = (text: string) => readonly Annotation[];

/** Raw HTML attributes using names such as `class`, not React's `className`. */
export type Attributes = RubyTextOptions["HTMLAttributes"];

/** Attribute options for a rendered element. */
export interface ElementOptions {
	/**
	 * Raw HTML attributes applied to the element.
	 * @default {}
	 */
	attributes?: Attributes;
}

/** Optional ruby separator text and attributes. */
export interface RPElementOptions extends ElementOptions {
	/**
	 * Plain text inside <rp>; HTML is not interpreted.
	 * @default "(" before the annotation; ")" after the annotation
	 */
	text?: string;
}

/** Ruby rendering options shared by the live field and HTML export. */
export interface RubyOptions extends ElementOptions {
	/** Customize the annotation element; omitting this option still creates <rt>. */
	rt?: ElementOptions;
	/** Optional annotation separators; omitted sides create no <rp> element. */
	rp?: {
		/** Separator before the annotation; an empty object uses "(". */
		before?: RPElementOptions;
		/** Separator after the annotation; an empty object uses ")". */
		after?: RPElementOptions;
	};
}

/** Annotation scope, validation policy, and error handling. */
export interface AnnotationBehaviorOptions {
	/**
	 * Annotation input scope: only new or changed lines, or the whole text.
	 * @default "line"
	 */
	scope?: "line" | "text";
	/**
	 * Lenient clamps bounds and silently discards malformed or empty ranges.
	 * Strict additionally rejects overlaps and surrogate/grapheme splits, rejects
	 * out-of-bounds ranges instead of clamping, and reports validation errors.
	 * @default "lenient"
	 */
	validation?: "lenient" | "strict";
	/** Callback for annotation errors after the edit commits; errors are thrown asynchronously when omitted. */
	onError?: (error: unknown) => void;
}

/** Plain-text field configuration shared by core and framework bindings. */
export interface RubyfieldOptions {
	/** Pure annotation function for the base text. */
	annotate: Annotate;
	/** Annotation processing policy; defaults to line scope and lenient validation. */
	annotationBehavior?: AnnotationBehaviorOptions;
	/** Base text replaced by later option or prop updates. */
	content?: string;
	/**
	 * Initial base text; later changes are ignored. Mutually exclusive with content.
	 * @default ""
	 */
	defaultContent?: string;
	/** Report base-text edits, excluding generated annotation changes. */
	onUpdate?: (content: string) => void;
	/** Rendering options for ruby text and annotation separators. */
	ruby?: RubyOptions;
	/**
	 * Raw HTML attributes applied to the element.
	 * @default {}
	 */
	attributes?: Attributes;
	/**
	 * Allow line breaks; fixed at creation, so recreate or remount the field to change it.
	 * @default true
	 */
	multiline?: boolean;
	/**
	 * Prevent editing while allowing focus, selection, and copying.
	 * @default false
	 */
	readOnly?: boolean;
	/**
	 * Prevent editing and remove the field from keyboard tab navigation.
	 * @default false
	 */
	disabled?: boolean;
	/**
	 * Text displayed while the base text is empty.
	 * @default ""
	 */
	placeholder?: string;
	/**
	 * Focus the field when it mounts.
	 * @default false
	 */
	autoFocus?: boolean;
}

/** Access to the field DOM, base text, selection, and HTML export. */
export interface RubyfieldHandle {
	/** Editable element, or null before mounting or after destruction. */
	readonly element: HTMLElement | null;
	/** Current base text without annotations or annotation separators. */
	readonly value: string;
	/** Focus the field unless disabled. */
	focus(): void;
	/** Remove focus from the field. */
	blur(): void;
	/** Select all base text. */
	select(): void;
	/** Select a half-open range using UTF-16 offsets in the base text. */
	setSelectionRange(start: number, end: number): void;
	/** Export an HTML string containing the base text and ruby annotations. */
	getHTML(): string;
}

/** Core field instance with runtime option updates and explicit cleanup. */
export interface Rubyfield extends RubyfieldHandle {
	/** Update runtime options; supplied content replaces the current base text. */
	setOptions(options: Partial<Omit<RubyfieldOptions, "multiline">>): void;
	/** Destroy the field and release its resources. */
	destroy(): void;
}
