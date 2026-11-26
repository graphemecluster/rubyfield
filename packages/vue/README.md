# Rubyfield

[![npm](https://img.shields.io/npm/v/@rubyfield/vue)](https://www.npmjs.com/package/@rubyfield/vue)
[![JSR](https://img.shields.io/jsr/v/@rubyfield/vue)](https://jsr.io/@rubyfield/vue)
[![Types](https://img.shields.io/npm/types/@rubyfield/vue)](https://www.npmjs.com/package/@rubyfield/vue?activeTab=code)
[![License](https://img.shields.io/npm/l/@rubyfield/vue)](https://github.com/graphemecluster/rubyfield/blob/main/LICENSE)

Rubyfield turns readings, glosses, and other text annotations into an input field you can see and try immediately. Type and edit the base text while the annotations update live above it.

Use it as a Pinyin, Jyutping, or Furigana input field with the [recipes](#recipes) below—or plug in your own annotation function. NLP library authors can use the same component as a playground: change the function, type a sentence, and see its output live.

- [Mandarin Pinyin](#mandarin-pinyin) with `pinyin-pro`.
- [Cantonese Jyutping](#cantonese-jyutping) with `to-jyutping`.
- [Japanese Furigana](#japanese-furigana) with `kuromoji` and `wanakana`.
- Custom readings, glosses, and other annotations through one `annotate` function.

Try the [live demo](https://graphemecluster.github.io/rubyfield/).

| For | Use Package |
| --- | --- |
| Framework-agnostic JavaScript | [rubyfield][core] |
| React 18+ (npm); React 19 (JSR) | [@rubyfield/react][react] |
| Vue 3+ | [@rubyfield/vue][vue] [current] |

## Quick start

Install `@rubyfield/vue` alongside Vue 3+ (3.5 or newer).

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Rubyfield, type Annotate, type RubyfieldHandle } from "@rubyfield/vue";

const content = ref("你好");
const field = ref<RubyfieldHandle>();
const annotate: Annotate = text => text === "你好" ? [[0, 1, "nei5"], [1, 2, "hou2"]] : [];
</script>

<template>
  <Rubyfield class="your-wrapper-class" ref="field" v-model:content="content" :annotate="annotate"
    placeholder="Start typing…"
    :attributes="{ class: 'your-input-field-class' }" />
</template>
```

## Recipes

### Mandarin Pinyin

Install `pinyin-pro`.

```vue
<script setup>
import { pinyin } from "pinyin-pro";
import { Rubyfield, segmentsToRanges } from "@rubyfield/vue";

const annotate = text => segmentsToRanges(pinyin(text, { type: "all" }).map(({ origin, pinyin, isZh }) => [origin, isZh ? pinyin : null]));
</script>

<template>
  <Rubyfield lang="zh" :annotate="annotate"
    :ruby="{ rt: { attributes: { lang: 'zh-Latn-pinyin' } } }" />
</template>
```

### Cantonese Jyutping

Install `to-jyutping`.

```vue
<script setup>
import { getJyutpingList } from "to-jyutping";
import { Rubyfield, segmentsToRanges } from "@rubyfield/vue";

const annotate = text => segmentsToRanges(getJyutpingList(text));
</script>

<template>
  <Rubyfield lang="yue" :annotate="annotate"
    :ruby="{ rt: { attributes: { lang: 'yue-Latn-jyutping' } } }" />
</template>
```

### Japanese Furigana

Install `kuromoji` and `wanakana`.

Serve Kuromoji's `dict` directory at `/dict/` as binary files without a `Content-Encoding` header. This example uses its browser bundle and async setup; render the component inside Vue’s `<Suspense>`.

```vue
<script setup>
import kuromoji from "kuromoji/build/kuromoji.js";
import { toHiragana } from "wanakana";
import { Rubyfield, segmentsToRanges } from "@rubyfield/vue";

const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: "/dict/" }).build((error, tokenizer) => error ? reject(error) : resolve(tokenizer)));
const annotate = text => segmentsToRanges(tokenizer.tokenize(text).map(({ surface_form, reading }) => [surface_form, /\p{Script=Han}/u.test(surface_form) && reading ? toHiragana(reading) : null]));
</script>

<template>
  <Rubyfield lang="ja" :annotate="annotate"
    :ruby="{ rt: { attributes: { lang: 'ja-Hira' } } }" />
</template>
```

### An unreliable narrator

This example demonstrates custom annotation with context-sensitive handling. `有趣` reads **yǒu qù** (“interesting”), but adding `真` (“really”) before it changes the reading to **wú liáo** (“boring”). `生命` gets the Japanese reading **いのち**: a narrator who finds life less interesting the more you insist otherwise.

```vue
<script setup>
import { Rubyfield } from "@rubyfield/vue";

const annotate = text => [...text.matchAll(/(?<とき>時間|瞬間)|(?<いのち>生命)|(?<yǒu>有)(?<qù>趣)|真(?<wú>有)(?<liáo>趣)/gd)].flatMap(match => Object.entries(match.indices.groups).flatMap(([groupName, indices]) => indices ? [[...indices, groupName]] : []));
</script>

<template>
  <Rubyfield defaultContent="生命真有趣" :annotate="annotate" />
</template>
```

### Plain-text annotation separators

`<rp>` supplies separators for plain-text representations, such as search-engine rendering and programmatically copying content with annotations. Without it, `textContent` sticks base text and annotation together. Browsers with ruby support normally hide these separators.

```vue
<script setup>
import { Rubyfield } from "@rubyfield/vue";

const annotate = () => [[0, 1, "nei5"]];
</script>

<template>
  <Rubyfield :annotate="annotate"
    :ruby="{ rp: { before: { text: '(' }, after: { text: ')' } } }" />
</template>
```

For base text `你` and reading `nei5`, the editable element (available through the handle's `element` property) has a `textContent` of `你(nei5)`. The same annotated text is available through `new DOMParser().parseFromString(html, "text/html").body.textContent`, where `html` is the string returned by the handle's `getHTML()` method. Normal copying from the field copies base text only.

## API

### Options

<table>
<thead><tr><th colspan="4">Option</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
<tbody>
<tr><td colspan="4"><code>annotate</code></td><td><code>(text: string) =&gt; readonly (readonly [startIndex: number, endIndex: number, rubyText: string])[]</code></td><td><strong>Required</strong></td><td>Pure function returning annotation ranges. Indices are zero-based UTF-16 offsets with an exclusive end, matching JavaScript string slicing. Empty ruby text leaves the base text unannotated.</td></tr>
<tr><td colspan="4"><code>annotationBehavior</code></td><td><code>AnnotationBehaviorOptions</code></td><td><code>undefined</code></td><td>Control annotation scope, invalid results, and errors.</td></tr>
<tr><td></td><td colspan="3"><code>scope</code></td><td><code>&quot;line&quot; | &quot;text&quot;</code></td><td><code>&quot;line&quot;</code></td><td><ul><li><code>line</code>: pass only new or changed newline-delimited lines to the annotator; unchanged lines retain their marks and reuse results. Useful when annotation is expensive.</li><li><code>text</code>: pass the whole base text so the annotator can use context across paragraphs; ranges crossing line breaks repeat their ruby text on each line. Changing the annotator, scope, or validation resets cached results.</li></ul></td></tr>
<tr><td></td><td colspan="3"><code>validation</code></td><td><code>&quot;lenient&quot; | &quot;strict&quot;</code></td><td><code>&quot;lenient&quot;</code></td><td><ul><li><code>lenient</code>: intended for integrating third-party annotation providers whose output you do not control. Discard non-array entries, non-number/non-finite/fractional indices, non-string ruby text, and reversed or empty ranges; clamp bounds. Preserve array order, overlaps, and surrogate/grapheme splits. Later ranges replace earlier marks where they overlap.</li><li><code>strict</code>: intended for annotator authors developing or debugging their functions. Discard out-of-bounds ranges instead of clamping; also discard overlaps and surrogate/grapheme splits. Process ranges in starting-index order; retain the previously accepted range on overlap. Report discarded entries in an <code>AggregateError</code>.</li></ul>A non-array result is treated as empty; strict mode also reports an error.</td></tr>
<tr><td></td><td colspan="3"><code>onError</code></td><td><code>(error: unknown) =&gt; void</code></td><td><code>undefined</code></td><td>Receive errors after the edit commits; without a handler, errors are thrown asynchronously. A throwing annotator leaves the affected text unannotated; strict validation retains valid entries. Annotation errors do not reject text edits.</td></tr>
<tr><td colspan="4"><code>content</code></td><td><code>string</code></td><td><code>undefined</code></td><td>Externally managed base text. Changes replace the current text; use <code>v-model:content</code> for two-way binding, or keep it in sync with <code>update:content</code>.</td></tr>
<tr><td colspan="4"><code>defaultContent</code></td><td><code>string</code></td><td><code>&quot;&quot;</code></td><td>Initial base text for an uncontrolled field. Do not combine with <code>content</code>.</td></tr>
<tr><td colspan="4"><code>update:content</code></td><td><code>(content: string) =&gt; void</code></td><td><code>undefined</code></td><td>Event emitted with the base text after an edit; used by <code>v-model:content</code>.</td></tr>
<tr><td colspan="4"><code>ruby</code></td><td><code>RubyOptions</code></td><td><code>undefined</code></td><td>Configure ruby elements in both the live field and HTML export.</td></tr>
<tr><td></td><td colspan="3"><code>attributes</code></td><td><code>Attributes</code></td><td><code>{}</code></td><td>Raw HTML attributes on <code>&lt;ruby&gt;</code>.</td></tr>
<tr><td></td><td colspan="3"><code>rt</code></td><td><code>ElementOptions</code></td><td><code>undefined</code></td><td>Configure <code>&lt;rt&gt;</code>. Omitting this option still creates the annotation element.</td></tr>
<tr><td></td><td></td><td colspan="2"><code>attributes</code></td><td><code>Attributes</code></td><td><code>{}</code></td><td>Raw HTML attributes on <code>&lt;rt&gt;</code>, such as the annotation language.</td></tr>
<tr><td></td><td colspan="3"><code>rp</code></td><td><code>{ before?: RPElementOptions; after?: RPElementOptions }</code></td><td><code>undefined</code></td><td>Configure plain-text separators around annotations. Omitting this option creates neither <code>&lt;rp&gt;</code> element.</td></tr>
<tr><td></td><td></td><td colspan="2"><code>before</code></td><td><code>RPElementOptions</code></td><td><code>undefined</code></td><td>Create an <code>&lt;rp&gt;</code> before the annotation only when this object is supplied.</td></tr>
<tr><td></td><td></td><td></td><td colspan="1"><code>text</code></td><td><code>string</code></td><td><code>&quot;(&quot;</code></td><td>Plain text inside the preceding <code>&lt;rp&gt;</code>; HTML is not interpreted.</td></tr>
<tr><td></td><td></td><td></td><td colspan="1"><code>attributes</code></td><td><code>Attributes</code></td><td><code>{}</code></td><td>Raw HTML attributes on the preceding <code>&lt;rp&gt;</code>.</td></tr>
<tr><td></td><td></td><td colspan="2"><code>after</code></td><td><code>RPElementOptions</code></td><td><code>undefined</code></td><td>Create an <code>&lt;rp&gt;</code> after the annotation only when this object is supplied.</td></tr>
<tr><td></td><td></td><td></td><td colspan="1"><code>text</code></td><td><code>string</code></td><td><code>&quot;)&quot;</code></td><td>Plain text inside the following <code>&lt;rp&gt;</code>; HTML is not interpreted.</td></tr>
<tr><td></td><td></td><td></td><td colspan="1"><code>attributes</code></td><td><code>Attributes</code></td><td><code>{}</code></td><td>Raw HTML attributes on the following <code>&lt;rp&gt;</code>.</td></tr>
<tr><td colspan="4"><code>attributes</code></td><td><code>Attributes</code></td><td><code>{}</code></td><td>Raw HTML attributes on the editable element, such as <code>lang</code>, <code>class</code>, or <code>aria-*</code>.</td></tr>
<tr><td colspan="4"><code>multiline</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Allow line breaks. When false, the field stays on one line; supplied or pasted/dropped line breaks become spaces. Set at creation; recreate or remount to change it.</td></tr>
<tr><td colspan="4"><code>readOnly</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Prevent editing while allowing focus, selection, and copying.</td></tr>
<tr><td colspan="4"><code>disabled</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Prevent editing and remove the field from keyboard tab navigation.</td></tr>
<tr><td colspan="4"><code>placeholder</code></td><td><code>string</code></td><td><code>&quot;&quot;</code></td><td>Text displayed while the base text is empty.</td></tr>
<tr><td colspan="4"><code>autoFocus</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Focus the field when it mounts.</td></tr>
</tbody>
</table>

### Usage

Rubyfield installs no CSS apart from the minimal styles needed for placeholders and single-line fields. Supply your own styles.

Input is plain text: pasted formatting and images are not retained, and line endings become `\n`. Base text is editable; annotations are read-only.

Each Rubyfield package exports the optional utility `segmentsToRanges(pairs)`, which converts `[baseText, rubyText]` pairs into UTF-16 annotation ranges. The `baseText` strings, joined in order, must reproduce the original text, including spaces and punctuation. A pair such as `["你好", "nei5 hou2"]` adds an annotation; `["！", null]` leaves that segment unannotated while counting its length for subsequent ranges.

Raw `Attributes` objects use HTML names (`class`, not `className`):

- Null/undefined omit an attribute.
- Other values are stringified. Use CSS strings for `style`; functions are not event listeners.

For example, use `hidden: ""` to enable `hidden` and omit it to disable it; `hidden: false` becomes `hidden="false"`, which still hides the element.

The field's handle provides access to its properties and methods through React's `ref.current`, Vue's template-ref `.value`, or the object returned by `createRubyfield(...)`. Its TypeScript type is `RubyfieldHandle`. The handle exposes:

- Properties:
  - `element`: the editable `HTMLElement`, or null.
  - `value`: the current base text, read-only.
- Methods:
  - `focus()` / `blur()`: focus or blur the field.
  - `select()`: select all base text.
  - `setSelectionRange(start, end)`: select a range using zero-based UTF-16 offsets.
  - `getHTML()`: return an annotated HTML string. Normal copying copies base text only.

Native DOM props, including classes, styles, and event callbacks, apply to the outer container with framework semantics. Use `attributes` for the editable element. Capture handlers run before field handling; `onUpdate` (core/React) or `update:content` (Vue) reports base-text edits. Children, rich HTML, `contentEditable`, and textarea-style `onChange` are not supported.

`v-model:content` binds the base text in both directions. Manual binding uses `:content="content"` with `@update:content="content = $event"`. The field mounts on the client.

## Launching the Demo

Try the [hosted demo](https://graphemecluster.github.io/rubyfield/), or run it locally from the repository root:

```sh
bun install
bun run dev
```

Open the URL printed by Vite. The demo includes Pinyin, Jyutping, and Furigana; the Japanese dictionary loads when Furigana is selected.

## Development

From the repository root:

- Build: `bun run build`.
- Check types: `bun run typecheck`.
- Format: `bun run format`.
- Check formatting: `bun run format:check`.
- Run tests:
  - Install managed Chromium once: `bunx --no-install playwright-core install chromium`.
  - All tests: `bun test`.
  - Browser tests only: `bun run test:browser`.
  - Unit tests only: `bun test tests/text.test.ts`.

Tests start and stop their own servers.

JSR uses the `deno.json` workspace configuration and publishes TypeScript source as `@rubyfield/core`, `@rubyfield/react`, and `@rubyfield/vue`. The JSR CLI downloads Deno internally; development uses Bun.

To release, set the same version in all three packages' `package.json` and `deno.json` files, update the core import versions in the root `deno.json` to match, then push a matching `vX.Y.Z` tag. The `publish.yml` workflow checks, builds, tests, and publishes to npm and JSR before creating a GitHub release. Prereleases use npm's `next` tag. Both registries require repository linking; npm also requires trusted publisher configuration for `publish.yml`. Failed runs can be retried; already published versions are skipped.

## License

[MIT](https://github.com/graphemecluster/rubyfield/blob/main/LICENSE).

[core]: https://github.com/graphemecluster/rubyfield/tree/main/packages/core#readme
[react]: https://github.com/graphemecluster/rubyfield/tree/main/packages/react#readme
[vue]: https://github.com/graphemecluster/rubyfield/tree/main/packages/vue#readme
