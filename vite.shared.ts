import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export function workspaceConfig() {
	return defineConfig({
		plugins: [react()],
		// Resolve local packages from source without requiring a library build.
		resolve: {
			alias: [
				{ find: "rubyfield/session", replacement: fileURLToPath(new URL("./packages/core/src/session.ts", import.meta.url)) },
				{ find: /^rubyfield$/, replacement: fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)) },
				{ find: "@rubyfield/react", replacement: fileURLToPath(new URL("./packages/react/src/index.tsx", import.meta.url)) },
				{ find: "@rubyfield/vue", replacement: fileURLToPath(new URL("./packages/vue/src/index.ts", import.meta.url)) },
			],
		},
	});
}
