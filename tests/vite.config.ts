import { fileURLToPath } from "node:url";

import { defineConfig, mergeConfig } from "vite";

import { workspaceConfig } from "../vite.shared.ts";

export default mergeConfig(
	workspaceConfig(),
	defineConfig({
		root: fileURLToPath(new URL("./fixtures", import.meta.url)),
		publicDir: false,
	}),
);
