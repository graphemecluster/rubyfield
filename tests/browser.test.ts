import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { type Browser, chromium, type Page } from "playwright-core";
import { createServer, mergeConfig, type ViteDevServer } from "vite";

import demoConfig from "../examples/demo/vite.config";
import fixtureConfig from "./vite.config";

describe("browser integration", () => {
	let browser: Browser;
	let fixtureServer: ViteDevServer;
	let demoServer: ViteDevServer;
	let fixtureOrigin: string;
	let page: Page;

	beforeAll(async () => {
		fixtureServer = await createServer(mergeConfig(fixtureConfig, {
			configFile: false,
			server: { host: "127.0.0.1", port: 0, forwardConsole: false },
		}));
		await fixtureServer.listen();
		fixtureOrigin = new URL(fixtureServer.resolvedUrls!.local[0]).origin;
		browser = await chromium.launch({ headless: true });
	}, 60_000);

	beforeEach(async () => {
		page = await browser.newPage();
	});
	afterEach(async () => {
		await page?.close();
	});
	afterAll(async () => {
		await Promise.all([browser?.close(), fixtureServer?.close(), demoServer?.close()]);
	});

	async function fixture(page: Page, framework: string) {
		await page.goto(`${fixtureOrigin}/?framework=${framework}`);
		await page.waitForFunction(() => Boolean((window as any).fixture?.handle?.element));
		await page.locator(".ProseMirror rt").first().waitFor();
	}

	test("Vue model binding synchronizes edits and external content without echo updates", async () => {
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await fixture(page, "vue");
		await page.evaluate(() => (window as any).fixture.setOptions({ defaultContent: undefined, content: "你好" }));
		await page.waitForFunction(() => (window as any).fixture.getContent() === "你好");
		await page.evaluate(() => {
			const f = (window as any).fixture;
			f.handle.focus();
			f.handle.setSelectionRange(2, 2);
		});
		await page.keyboard.type("X");
		await page.waitForFunction(() => (window as any).fixture.getContent() === "你好X");
		expect(await page.evaluate(() => (window as any).fixture.state.updates)).toEqual(["你好X"]);
		await page.evaluate(() => (window as any).fixture.setOptions({ content: "世界" }));
		await page.waitForFunction(() => (window as any).fixture.handle.value === "世界");
		expect(await page.evaluate(() => (window as any).fixture.state.updates)).toEqual(["你好X"]);
		const cdp = await page.context().newCDPSession(page);
		await page.evaluate(() => (window as any).fixture.handle.setSelectionRange(2, 2));
		await cdp.send("Input.imeSetComposition", { text: "n", selectionStart: 1, selectionEnd: 1 });
		await cdp.send("Input.insertText", { text: "你" });
		await page.waitForFunction(() => (window as any).fixture.getContent() === "世界你");
		expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("世界你");
		expect(errors).toEqual([]);
	}, 30_000);

	for (const framework of ["core", "react", "vue"]) {
		test(`${framework}: editing, ruby rendering, attributes, and IME`, async () => {
			const errors: string[] = [];
			page.on("pageerror", error => errors.push(error.message));
			await fixture(page, framework);
			const cdp = await page.context().newCDPSession(page);
			const editable = page.locator(".ProseMirror");
			const sharedStyles = await page.evaluate(() => {
				const removePeer = (window as any).fixture.createPeer();
				const count = document.adoptedStyleSheets.length;
				removePeer();
				return count;
			});
			expect(sharedStyles, "Editors share the functional placeholder stylesheet").toBe(1);
			expect(await editable.evaluate(el => el.classList.contains("rubyfield"))).toBe(false);
			expect(await editable.getAttribute("data-empty")).toBe(null);
			expect(await editable.getAttribute("data-placeholder")).toBe(null);

			// Editable-root attributes are replaced by ProseMirror without stealing focus.
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				f.setOptions({ attributes: { "aria-label": "Editable", "class": "custom-editor", "style": "color: rgb(1, 2, 3)", "data-old": "old" } });
			});
			await page.waitForFunction(() => document.querySelector(".ProseMirror")?.getAttribute("data-old") === "old");
			expect(await editable.evaluate(el => el.classList.contains("tiptap") && el.classList.contains("custom-editor"))).toBeTruthy();
			await page.evaluate(() => (window as any).fixture.setOptions({ attributes: { "aria-label": "Fixture", "data-new": "new", "contenteditable": "false" } }));
			await page.waitForFunction(() => document.querySelector(".ProseMirror")?.getAttribute("data-new") === "new");
			expect(await editable.getAttribute("data-old")).toBe(null);
			expect(await editable.evaluate(el => (el as HTMLElement).style.color)).toBe("");
			expect(await editable.getAttribute("contenteditable")).toBe("true");
			expect(await editable.evaluate(el => !el.classList.contains("custom-editor") && el.classList.contains("ProseMirror-focused") && document.activeElement === el)).toBeTruthy();

			if (framework !== "core") {
				await page.evaluate(framework => (window as any).fixture.setWrapperProps({
					"id": "native-wrapper",
					[framework === "react" ? "className" : "class"]: "native-class",
					"style": { marginTop: "7px" },
					"hidden": true,
					"draggable": false,
					"aria-hidden": false,
				}), framework);
				const wrapper = page.locator("#native-wrapper");
				await wrapper.waitFor({ state: "attached" });
				expect(await wrapper.evaluate(el => el.hasAttribute("hidden"))).toBeTruthy();
				expect(await wrapper.getAttribute("draggable")).toBe("false");
				expect(await wrapper.getAttribute("aria-hidden")).toBe("false");
				expect(await wrapper.evaluate(el => (el as HTMLElement).style.marginTop)).toBe("7px");
				expect(await editable.getAttribute("id")).toBe(null);
				await page.evaluate(() => (window as any).fixture.setWrapperProps({ id: "native-wrapper", hidden: false }));
				await page.waitForFunction(() => !document.getElementById("native-wrapper")?.hasAttribute("hidden"));
				expect(await wrapper.getAttribute("draggable")).toBe(null);
				expect(await wrapper.getAttribute("class")).toBe(null);
				expect(await wrapper.evaluate(el => (el as HTMLElement).style.marginTop)).toBe("");
				await page.evaluate(() => (window as any).fixture.handle.focus());
			}

			// Functional styles are installed without a stylesheet import.
			expect(await editable.evaluate(el => getComputedStyle(el).whiteSpace)).toBe("break-spaces");
			const copied = await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				f.handle.select();
				const data = new DataTransfer();
				f.handle.element.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
				return data.getData("text/plain");
			});
			expect(copied, "Copying uses base text without needing user-select rules").toBe("你好");
			expect(await editable.locator("rt").evaluateAll(elements => elements.every(el => el.getAttribute("contenteditable") === "false"))).toBeTruthy();

			for (const key of ["Backspace", "Escape"]) {
				await page.evaluate(() => {
					const f = (window as any).fixture;
					f.handle.focus();
					f.handle.setSelectionRange(2, 2);
				});
				for (const text of ["n", "ne", "nei"]) await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
				await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, windowsVirtualKeyCode: 229 });
				if (key === "Backspace") { for (const text of ["ne", "n"]) await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length }); }
				await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
				await page.waitForTimeout(60);
				expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你好");
				expect(await page.evaluate(() => Boolean(window.getSelection()?.rangeCount))).toBeTruthy();
				await page.keyboard.type("X");
				expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你好X");
				expect(await editable.evaluate(el => el.classList.contains("ProseMirror-focused"))).toBeTruthy();
				await page.keyboard.press("Backspace");
			}
			if (framework !== "core") expect(await page.evaluate(() => (window as any).fixture.state.keydowns > 0)).toBeTruthy();

			// Both optional separator elements and rt attributes update without replacing text.
			for (
				const [ruby, expected] of [
					[{ rt: { attributes: { lang: "yue-Latn-jyutping" } } }, []],
					[{ rp: { before: { text: "[" } } }, ["["]],
					[{ rp: { after: { text: "]" } } }, ["]"]],
					[{ rp: { before: {}, after: {} } }, ["(", ")"]],
				] as const
			) {
				await page.evaluate(ruby => (window as any).fixture.setOptions({ ruby }), ruby);
				await page.waitForTimeout(30);
				const result = await page.evaluate(() => {
					const f = (window as any).fixture;
					const exported = new DOMParser().parseFromString(f.handle.getHTML(), "text/html");
					return {
						live: [...f.handle.element.querySelector("ruby").querySelectorAll("rp")].map((el: any) => el.textContent),
						exported: [...exported.querySelector("ruby")!.querySelectorAll("rp")].map(el => el.textContent),
						value: f.handle.value,
					};
				});
				expect(result.live).toEqual([...expected]);
				expect(result.exported).toEqual([...expected]);
				expect(result.value).toBe("你好");
			}

			// Custom ruby DOM and HTML export share raw serialization and remove stale values.
			await page.evaluate(() => {
				const value: any = { toString: () => "provider-value" };
				value.self = value;
				(window as any).fixture.setOptions({
					ruby: {
						attributes: { "class": "old-ruby", "style": "color: red", "data-old": "old", "hidden": false, "data-object": value },
						rt: { attributes: { "lang": "yue-Latn-jyutping", "aria-hidden": false, "draggable": false, "contenteditable": "true", "data-omit": null } },
						rp: { before: { attributes: { "data-side": "before" } }, after: { attributes: { "data-side": "after" } } },
					},
				});
			});
			await page.waitForFunction(() => document.querySelector("ruby")?.getAttribute("data-old") === "old");
			expect(await editable.locator("ruby").first().getAttribute("hidden")).toBe("false");
			expect(await editable.locator("ruby").first().getAttribute("data-object")).toBe("provider-value");
			expect(
				await page.evaluate(() => {
					const exported = new DOMParser().parseFromString((window as any).fixture.handle.getHTML(), "text/html");
					return exported.querySelector("ruby")?.getAttribute("hidden") === "false"
						&& exported.querySelector("ruby")?.getAttribute("data-object") === "provider-value"
						&& exported.querySelector("rt")?.getAttribute("aria-hidden") === "false";
				}),
			).toBeTruthy();
			for (const name of ["aria-hidden", "draggable"]) expect(await editable.locator("rt").first().getAttribute(name)).toBe("false");
			expect(await editable.locator("rt").first().getAttribute("contenteditable")).toBe("false");
			expect(await editable.locator("rt").first().getAttribute("data-omit")).toBe(null);
			await page.evaluate(() => (window as any).fixture.setOptions({
				ruby: {
					attributes: { "data-new": "new" },
					rt: { attributes: { lang: "zh-Latn-pinyin" } },
					rp: { after: { text: "]", attributes: { "data-side": "changed" } } },
				},
			}));
			await page.waitForFunction(() => document.querySelector("ruby")?.getAttribute("data-new") === "new");
			expect(
				await page.evaluate(() => {
					const f = (window as any).fixture;
					const exported = new DOMParser().parseFromString(f.handle.getHTML(), "text/html");
					return [f.handle.element, exported].every(root => {
						const ruby = root.querySelector("ruby");
						return !ruby.hasAttribute("class") && !ruby.hasAttribute("style") && !ruby.hasAttribute("hidden") && !ruby.hasAttribute("data-old")
							&& ruby.querySelector("rt").getAttribute("lang") === "zh-Latn-pinyin"
							&& !ruby.querySelector("rt").hasAttribute("aria-hidden") && ruby.querySelectorAll("rp").length === 1
							&& ruby.querySelector("rp").getAttribute("data-side") === "changed";
					});
				}),
			).toBeTruthy();

			// Text containing HTML and trailing newlines stays plain and round-trips.
			await page.evaluate(() => (window as any).fixture.setOptions({ content: "<b>你好</b>😀\n\n" }));
			await page.waitForTimeout(30);
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("<b>你好</b>😀\n\n");
			expect(await editable.locator("b,strong,img:not(.ProseMirror-separator)").count()).toBe(0);
			await page.evaluate(() => (window as any).fixture.setOptions({ disabled: true }));
			await page.waitForTimeout(30);
			expect(await editable.getAttribute("contenteditable")).toBe("false");
			expect(await editable.getAttribute("tabindex")).toBe("-1");
			await page.evaluate(() => (window as any).fixture.setOptions({ disabled: false, readOnly: true }));
			await page.waitForTimeout(30);
			expect(await editable.getAttribute("aria-readonly")).toBe("true");
			expect(await editable.getAttribute("tabindex")).toBe("0");

			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.setOptions({ readOnly: false, annotate: () => [[0, 1, "jan4"], [1, 2, "jan4"]], content: "人人" });
			});
			await page.waitForTimeout(30);
			expect(await editable.locator("ruby").count(), "Adjacent annotations with identical readings remain distinct").toBe(2);

			await page.evaluate(() => (window as any).fixture.setOptions({ annotate: () => [], content: "", placeholder: "Write here" }));
			await page.waitForTimeout(30);
			expect(await editable.locator("p").first().evaluate(el => getComputedStyle(el, "::before").content)).toBe('"Write here"');
			expect(await page.evaluate(() => (window as any).fixture.handle.value), "Placeholder text is not part of the document").toBe("");
			await page.evaluate(() => (window as any).fixture.setOptions({ placeholder: "Read-only prompt", readOnly: true }));
			await page.waitForFunction(() => document.querySelector(".ProseMirror p")?.getAttribute("data-placeholder") === "Read-only prompt");
			expect(await editable.locator("p").first().evaluate(el => getComputedStyle(el, "::before").content)).toBe('"Read-only prompt"');
			await page.evaluate(() => (window as any).fixture.setOptions({ placeholder: undefined, readOnly: false }));
			await page.waitForFunction(() => document.querySelector(".ProseMirror p")?.getAttribute("data-placeholder") === "");
			expect(await editable.locator("p").first().evaluate(el => getComputedStyle(el, "::before").content)).toBe('""');
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				const data = new DataTransfer();
				data.setData("text/plain", "😀\n你好");
				data.setData("text/html", '<b>Wrong</b><img src="x">');
				f.handle.element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			});
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("😀\n你好");
			expect(await editable.evaluate(el => getComputedStyle(el, "::before").content), "Placeholder disappears after input").toBe("none");
			expect(await editable.locator("b,strong,img:not(.ProseMirror-separator)").count()).toBe(0);
			expect(await page.evaluate(() => (window as any).fixture.state.updates.at(-1))).toBe("😀\n你好");
			// Unchanged paragraphs reuse pure annotation results, including after structural edits.
			await page.evaluate(() => {
				const w = window as any;
				w.calls = [];
				w.annotationErrors = [];
				w.fixture.setOptions({
					content: "a\nb",
					annotationBehavior: { onError: (error: unknown) => w.annotationErrors.push(error) },
					annotate: (text: string) => {
						w.calls.push(text);
						return text ? [[0, text.length, "reading"]] : [];
					},
				});
			});
			await page.waitForFunction(() => (window as any).calls.includes("b"));
			expect(await page.evaluate(() => (window as any).calls)).toEqual(["a", "b"]);
			await page.evaluate(() => {
				const w = window as any;
				w.unchangedLine = w.fixture.handle.element.editor.state.doc.child(1);
				w.fixture.closeHistory();
			});
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				f.handle.setSelectionRange(1, 1);
			});
			await page.keyboard.type("X");
			expect(await page.evaluate(() => (window as any).calls)).toEqual(["a", "b", "aX"]);
			expect(
				await page.evaluate(() => {
					const w = window as any;
					return w.fixture.handle.element.editor.state.doc.child(1) === w.unchangedLine;
				}),
				"Editing another line preserves the original marked node",
			).toBeTruthy();
			await page.keyboard.press("Control+z");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("a\nb");
			await page.keyboard.press("Control+Shift+z");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("aX\nb");
			expect(
				await page.evaluate(() => {
					const w = window as any;
					return w.fixture.handle.element.editor.state.doc.child(1) === w.unchangedLine;
				}),
				"Undo and redo preserve the unaffected marked line",
			).toBeTruthy();
			await page.keyboard.press("Enter");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("aX\n\nb");
			expect(await page.evaluate(() => (window as any).calls)).toEqual(["a", "b", "aX", "a", "aX", ""]);
			await page.keyboard.press("Backspace");
			expect(await page.evaluate(() => (window as any).calls)).toEqual(["a", "b", "aX", "a", "aX", ""]);
			await page.evaluate(() => {
				const w = window as any;
				w.fixture.setOptions({ content: undefined, annotationBehavior: { scope: "text", onError: (error: unknown) => w.annotationErrors.push(error) } });
			});
			await page.waitForFunction(() => (window as any).calls.at(-1) === "aX\nb");

			// Invalid provider output cannot duplicate text; strict errors retain valid readings.
			await page.evaluate(() => {
				const w = window as any;
				w.fixture.setOptions({
					content: "abcdef",
					annotationBehavior: { validation: "lenient", onError: (error: unknown) => w.annotationErrors.push(error) },
					annotate: () => [[4, 2, "reversed"], [-9, 2, "clamped"], [1, 99, "overlap"]],
				});
			});
			await page.waitForFunction(() => (window as any).fixture.handle.value === "abcdef");
			expect(await editable.locator("rt").last().textContent()).toBe("overlap");
			await page.evaluate(() => {
				const w = window as any;
				w.fixture.setOptions({
					content: "e\u0301你",
					annotationBehavior: { validation: "strict", onError: (error: unknown) => w.annotationErrors.push(error) },
					annotate: () => [[0, 1, "split"], [2, 3, "nei5"]],
				});
			});
			await page.waitForFunction(() => (window as any).annotationErrors.length > 0);
			expect(await editable.locator("rt").count()).toBe(1);
			expect(await editable.locator("rt").textContent()).toBe("nei5");
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				f.handle.setSelectionRange(3, 3);
			});
			await page.keyboard.type("X");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("e\u0301你X");
			expect(await page.evaluate(() => (window as any).fixture.state.updates.at(-1))).toBe("e\u0301你X");

			// Unhandled errors are thrown after dispatch; subsequent typing and IME still work.
			await page.evaluate(() => (window as any).fixture.setOptions({
				content: undefined,
				annotationBehavior: {},
				annotate: () => {
					throw new Error("provider failed");
				},
			}));
			await page.waitForFunction(() => document.querySelectorAll(".ProseMirror rt").length === 0);
			await page.keyboard.type("Y");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("e\u0301你XY");
			await cdp.send("Input.imeSetComposition", { text: "n", selectionStart: 1, selectionEnd: 1 });
			await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
			await page.waitForTimeout(60);
			await page.keyboard.type("Z");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("e\u0301你XYZ");
			expect(errors.length > 0).toBeTruthy();
			expect(errors.every(error => error === "provider failed")).toBeTruthy();
			errors.length = 0;
			await page.evaluate(() => (window as any).fixture.destroy());
			expect(errors).toEqual([]);
		}, 30_000);
	}

	for (const framework of ["core", "react", "vue"]) {
		test(`${framework}: single-line schema, clipboard, and history`, async () => {
			await page.goto(`${fixtureOrigin}/?framework=${framework}&multiline=false`);
			await page.waitForFunction(() => (window as any).fixture?.handle?.value === "你 好");
			expect(await page.locator(".ProseMirror").getAttribute("aria-multiline")).toBe("false");
			const editable = page.locator(".ProseMirror");
			const cdp = await page.context().newCDPSession(page);
			// A single-paragraph schema rejects structural splits without input blockers.
			expect(await editable.evaluate(el => getComputedStyle(el).whiteSpace)).toBe("pre");
			expect(await editable.evaluate(el => getComputedStyle(el).overflowX)).toBe("auto");
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.focus();
				f.handle.select();
			});
			for (const key of ["Enter", "Shift+Enter"]) await page.keyboard.press(key);
			expect(await page.evaluate(() => (window as any).fixture.handle.value), "Enter neither inserts a newline nor replaces selected text").toBe("你 好");
			await page.evaluate(() => {
				const f = (window as any).fixture;
				const data = new DataTransfer();
				data.setData("text/plain", "你\r\n好\n");
				f.handle.element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			});
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你 好 ");
			const split = await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.setSelectionRange(1, 1);
				f.closeHistory();
				return f.handle.element.editor.commands.splitBlock();
			});
			expect(split).toBe(false);
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你 好 ");
			expect(await editable.locator("p").count()).toBe(1);
			await page.keyboard.type("X");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你X 好 ");
			await page.keyboard.press("Control+z");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你 好 ");
			await page.keyboard.press("Control+Shift+z");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你X 好 ");
			await page.evaluate(() => {
				const f = (window as any).fixture;
				f.handle.setSelectionRange(f.handle.value.length, f.handle.value.length);
			});
			await cdp.send("Input.imeSetComposition", { text: "n", selectionStart: 1, selectionEnd: 1 });
			await cdp.send("Input.insertText", { text: "你" });
			await page.waitForTimeout(60);
			await page.keyboard.type("X");
			expect(await page.evaluate(() => (window as any).fixture.handle.value)).toBe("你X 好 你X");
			await page.evaluate(() => (window as any).fixture.setOptions({ content: "a\r\nb\nc" }));
			await page.waitForFunction(() => (window as any).fixture.handle.value === "a b c");
			await page.evaluate(() => {
				const element = (window as any).fixture.handle.element;
				const bounds = element.getBoundingClientRect();
				const data = new DataTransfer();
				data.setData("text/plain", "d\ne");
				data.setData("text/html", "<p>d</p><p>e</p>");
				element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: bounds.left + 5, clientY: bounds.top + bounds.height / 2 }));
			});
			expect(await page.evaluate(() => (window as any).fixture.handle.value.includes("d e"))).toBeTruthy();
			expect(await editable.locator("p").count()).toBe(1);

			await page.evaluate(() => (window as any).fixture.destroy());
		}, 30_000);
	}

	test("language demo", async () => {
		await import("../examples/demo/prepare");
		demoServer = await createServer(mergeConfig(demoConfig, {
			configFile: false,
			root: import.meta.dir + "/../examples/demo",
			server: { host: "127.0.0.1", port: 0, forwardConsole: false },
		}));
		await demoServer.listen();
		const demoOrigin = new URL(demoServer.resolvedUrls!.local[0]).origin;
		await page.goto(demoOrigin);
		await page.getByRole("textbox").waitFor();
		for (const [label, lang, readingLang] of [
			["Mandarin Pinyin", "zh", "zh-Latn-pinyin"],
			["Cantonese Jyutping", "yue", "yue-Latn-jyutping"],
			["Japanese Furigana", "ja", "ja-Hira"],
		]) {
			await page.getByRole("radio", { name: label }).check();
			await page.waitForFunction(
				({ lang, readingLang }) => {
					const editor = document.querySelector(".ProseMirror");
					return editor?.getAttribute("lang") === lang && [...editor.querySelectorAll("rt")].some(el => el.getAttribute("lang") === readingLang && Boolean(el.textContent));
				},
				{ lang, readingLang },
				{ timeout: 30_000 },
			);
		}
	}, 60_000);
});
