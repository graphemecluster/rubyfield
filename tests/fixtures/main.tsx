import { closeHistory } from "@tiptap/pm/history";
import { createElement, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createApp, defineComponent, h, onMounted, ref } from "vue";

import { Rubyfield as ReactRubyfield } from "@rubyfield/react";
import { Rubyfield as VueRubyfield } from "@rubyfield/vue";
import type { Annotate, RubyfieldHandle, RubyfieldOptions } from "rubyfield";
import { createRubyfield, segmentsToRanges } from "rubyfield";

const annotate: Annotate = text => segmentsToRanges(Array.from(text).map(base => [base, ({ 你: "nei5", 好: "hou2", 香: "hoeng1", 港: "gong2" } as Record<string, string>)[base]]));
const multiline = new URLSearchParams(location.search).get("multiline") !== "false";
const options: RubyfieldOptions = { annotate, multiline, defaultContent: multiline ? "你好" : "你\n好", attributes: { "aria-label": "Fixture" } };
const mode = new URLSearchParams(location.search).get("framework") ?? "core";
const host = document.getElementById("root")!;
const state = { updates: [] as string[], keydowns: 0 };
const api = {
	handle: null as RubyfieldHandle | null,
	setOptions: (_options: Partial<RubyfieldOptions>) => {},
	setWrapperProps: (_props: Record<string, unknown>) => {},
	getContent: (): string | undefined => undefined,
	destroy: () => {},
	closeHistory() {
		const editor = (api.handle?.element as any).editor;
		editor.view.dispatch(closeHistory(editor.state.tr));
	},
	createPeer() {
		const container = document.createElement("div");
		document.body.append(container);
		const editor = createRubyfield(container, { annotate, placeholder: "Another editor" });
		return () => {
			editor.destroy();
			container.remove();
		};
	},
	state,
};
Object.assign(window, { fixture: api });

if (mode === "core") {
	const editor = createRubyfield(host, { ...options, onUpdate: text => state.updates.push(text) });
	api.handle = editor;
	api.setOptions = next => editor.setOptions(next);
	api.destroy = () => editor.destroy();
}
else if (mode === "react") {
	function Fixture() {
		const handle = useRef<RubyfieldHandle>(null);
		const [props, setProps] = useState(options);
		const [wrapperProps, setWrapperProps] = useState<Record<string, unknown>>({});
		useLayoutEffect(() => {
			api.handle = handle.current;
			api.setOptions = next => setProps(props => ({ ...props, ...next }));
			api.setWrapperProps = setWrapperProps;
		});
		return createElement(ReactRubyfield, {
			...props,
			...wrapperProps,
			ref: handle,
			onUpdate: text => state.updates.push(text),
			onKeyDown: () => state.keydowns++,
		});
	}
	const root = createRoot(host);
	root.render(createElement(Fixture));
	api.destroy = () => root.unmount();
}
else {
	const app = createApp(defineComponent({
		setup() {
			const handle = ref<RubyfieldHandle>();
			const props = ref(options);
			const wrapperProps = ref<Record<string, unknown>>({});
			onMounted(() => {
				api.handle = handle.value ?? null;
				api.getContent = () => props.value.content;
				api.setWrapperProps = next => {
					wrapperProps.value = next;
				};
				api.setOptions = next => {
					props.value = { ...props.value, ...next };
				};
			});
			return () => h(VueRubyfield, {
				...props.value,
				...wrapperProps.value,
				"ref": handle,
				"onUpdate:content": (text: string) => {
					state.updates.push(text);
					if (props.value.content !== undefined) props.value.content = text;
				},
				"onKeydown": () => state.keydowns++,
			});
		},
	}));
	app.mount(host);
	api.destroy = () => app.unmount();
}
