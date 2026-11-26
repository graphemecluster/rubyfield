import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Annotation } from "./types";

export function normalizeText(text: string, multiline = true) {
	const normalized = text.replace(/\r\n?/g, "\n");
	return multiline ? normalized : normalized.replace(/\n/g, " ");
}

export function textDocument(text: string) {
	// Construct JSON rather than parsing HTML so literal markup and empty lines survive.
	return {
		type: "doc",
		content: normalizeText(text).split("\n").map(line => ({
			type: "paragraph",
			...(line ? { content: [{ type: "text", text: line }] } : {}),
		})),
	};
}

export const documentText = (doc: ProseMirrorNode) => doc.textBetween(0, doc.content.size, "\n");

export function documentPosition(doc: ProseMirrorNode, index: number) {
	const target = Math.max(0, Math.min(documentText(doc).length, Math.trunc(index) || 0));
	let offset = 0;
	let position = 1;

	// Paragraph boundaries occupy model positions but appear as one newline in public text.
	doc.forEach((paragraph, pos) => {
		if (target >= offset) position = pos + 1 + Math.min(target - offset, paragraph.content.size);
		offset += paragraph.content.size + 1;
	});

	return position;
}

/** Convert consecutive base text and annotation text pairs to UTF-16 ranges. */
export function segmentsToRanges(pairs: readonly (readonly [text: string, rubyText: string | null | undefined])[]): Annotation[] {
	let offset = 0;

	return pairs.flatMap(([base, rubyText]) => {
		const start = offset;
		offset += base.length; // ProseMirror uses UTF-16 offsets.
		return base.length && rubyText ? [[start, offset, rubyText] as const] : [];
	});
}

export function validateAnnotations(text: string, input: unknown, mode: "lenient" | "strict") {
	const annotations: Annotation[] = [];
	const errors: RangeError[] = [];
	const strict = mode === "strict";

	function malformed(message: string, value: unknown) {
		let item: string;
		try {
			item = JSON.stringify(value, (_key, part) => typeof part === "bigint" || (typeof part === "number" && !Number.isFinite(part)) ? String(part) : part) ?? String(value);
		}
		catch {
			try {
				item = String(value);
			}
			catch {
				item = "[unserializable item]";
			}
		}
		return new RangeError(`${message} Received: ${item}`);
	}

	if (!Array.isArray(input)) {
		if (strict) errors.push(malformed("Annotation result must be an array.", input));
		return { annotations, errors };
	}

	// Grapheme boundaries also exclude surrogate, combining-mark, and ZWJ splits.
	// Use "zxx" independent of the current environment's locale for stability.
	const boundaries = strict ? new Set([text.length, ...Array.from(new Intl.Segmenter("zxx", { granularity: "grapheme" }).segment(text), part => part.index)]) : undefined;

	for (const entry of input) {
		if (!Array.isArray(entry)) {
			if (strict) errors.push(malformed("Annotation must be a [start, end, rubyText] tuple.", entry));
			continue;
		}
		const [start, end, rubyText] = entry;
		if (!Number.isInteger(start) || !Number.isInteger(end) || typeof rubyText !== "string" || start > end) {
			if (strict) errors.push(malformed("Annotation indices must be integers in ascending order and the ruby text must be a string.", entry));
			continue;
		}
		if (strict && (start < 0 || end > text.length || start === end || !boundaries!.has(start) || !boundaries!.has(end))) {
			errors.push(malformed("Annotation must be a non-empty range within the text at grapheme boundaries.", entry));
			continue;
		}
		const from = Math.max(0, Math.min(text.length, start));
		const to = Math.max(0, Math.min(text.length, end));
		if (from < to) annotations.push([from, to, rubyText]);
	}

	if (strict) {
		// Keep the earlier starting range when overlaps are rejected.
		annotations.sort((a, b) => a[0] - b[0]);
		let previousEnd = 0;
		return {
			annotations: annotations.filter(entry => {
				const [start, end] = entry;
				if (start < previousEnd) {
					errors.push(malformed("Annotation ranges must not overlap.", entry));
					return false;
				}
				previousEnd = end;
				return true;
			}),
			errors,
		};
	}
	return { annotations, errors };
}
