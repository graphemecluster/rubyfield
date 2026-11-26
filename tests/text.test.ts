import { describe, expect, test } from "bun:test";

import { Schema } from "@tiptap/pm/model";

import { documentPosition, documentText, segmentsToRanges, textDocument, validateAnnotations } from "../packages/core/src/text";

const schema = new Schema({
	nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {} },
});

describe("plain text and annotation positions", () => {
	test("preserves empty lines, trailing lines, HTML-looking text, and emoji", () => {
		const text = "<b>你</b>😀\n\n好\n";
		const doc = schema.nodeFromJSON(textDocument(text));
		expect(documentText(doc)).toBe(text);
		expect(documentPosition(doc, 0)).toBe(1);
		expect(documentPosition(doc, text.length)).toBe(doc.content.size - 1);
	});
	test("readings keep UTF-16 offsets after unannotated characters", () => {
		expect(segmentsToRanges([["😀", null], ["你好", "nei5 hou2"], ["!", null], ["人", "jan4"]])).toEqual([
			[2, 4, "nei5 hou2"],
			[5, 6, "jan4"],
		]);
	});
	test("lenient mode clamps bounds without changing overlap order or split boundaries", () => {
		const result = validateAnnotations("😀你", [[-5, 2, "a"], [1, 99, "b"], [3, 1, "bad"], [0.5, 2, "bad"], [0, 0, "empty"], [NaN, 2, "bad"]], "lenient");
		expect(result.annotations).toEqual([[0, 2, "a"], [1, 3, "b"]]);
		expect(result.errors).toEqual([]);
	});
	test("strict mode discards overlap, invalid bounds, and grapheme splits while keeping valid entries", () => {
		const text = "😀e\u0301👨‍👩‍👧‍👦你";
		const result = validateAnnotations(text, [
			[0, 2, "emoji"],
			[1, 2, "surrogate"],
			[2, 3, "combining"],
			[4, 6, "zwj"],
			[2, 4, "accent"],
			[0, 4, "overlap"],
			[-1, 2, "bounds"],
			[4, text.length - 1, "family"],
			[text.length - 1, text.length, "nei5"],
		], "strict");
		expect(result.annotations).toEqual([[0, 2, "emoji"], [2, 4, "accent"], [4, text.length - 1, "family"], [text.length - 1, text.length, "nei5"]]);
		expect(result.errors).toHaveLength(5);
	});
	test("both modes discard malformed provider entries", () => {
		const input = [null, ["0", 1, "x"], [0, 1, 2], [Infinity, 1, "x"], [2, 1, "x"], [0, 1, "ok"]] as any;
		for (const mode of ["lenient", "strict"] as const) {
			const result = validateAnnotations("你好", input, mode);
			expect(result.annotations).toEqual([[0, 1, "ok"]]);
			expect(result.errors).toHaveLength(mode === "strict" ? 5 : 0);
		}
	});
	test("rejects non-array results and includes malformed values in strict errors", () => {
		for (const input of [undefined, null, "text", { ranges: [] }, new Set([[0, 1, "x"]])]) {
			expect(validateAnnotations("你好", input, "lenient")).toEqual({ annotations: [], errors: [] });
			const result = validateAnnotations("你好", input, "strict");
			expect(result.annotations).toEqual([]);
			expect(result.errors[0].message).toContain("result must be an array");
			expect(result.errors[0].message).toContain("Received:");
		}
		for (const entry of [[2, 1, "reversed"], [0, 1, 123], [-1, 1, "bounds"], "item"]) {
			expect(validateAnnotations("你好", [entry], "strict").errors[0].message).toContain(JSON.stringify(entry));
		}
		expect(validateAnnotations("你好", [[0, 2, "first"], [1, 2, "overlap"]], "strict").errors[0].message).toContain('[1,2,"overlap"]');
	});
});
