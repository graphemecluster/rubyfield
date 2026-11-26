import { readFile } from "node:fs/promises";

import { defineConfig, mergeConfig } from "vite";

import { workspaceConfig } from "../../vite.shared.ts";

import type { IncomingMessage, ServerResponse } from "node:http";

// Kuromoji decompresses dictionary bytes itself; Vite otherwise adds gzip encoding.
function dictionary(req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) {
	const path = req.url?.split("?")[0];
	if (!path || !/^\/kuromoji\/dict\/[a-z_]+\.dat\.gz$/.test(path)) return next();

	readFile(new URL(`./public${path}`, import.meta.url)).then(bytes => {
		res.setHeader("Content-Type", "application/octet-stream");
		res.end(bytes);
	}).catch(next);
}

export default mergeConfig(
	workspaceConfig(),
	defineConfig({
		plugins: [{
			name: "kuromoji-dictionary",
			configureServer(server) {
				server.middlewares.use(dictionary);
			},

			configurePreviewServer(server) {
				server.middlewares.use(dictionary);
			},
		}],
	}),
);
