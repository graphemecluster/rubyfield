import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("kuromoji/package.json"));
const target = new URL("./public/kuromoji/", import.meta.url);

// Serve the browser bundle and dictionary locally instead of depending on a CDN.
await mkdir(target, { recursive: true });
await cp(join(source, "dict"), new URL("./dict/", target), { recursive: true });
await cp(join(source, "build/kuromoji.js"), new URL("./kuromoji.js", target));
await cp(join(source, "LICENSE-2.0.txt"), new URL("./LICENSE", target));
await cp(join(source, "NOTICE.md"), new URL("./NOTICE", target));
