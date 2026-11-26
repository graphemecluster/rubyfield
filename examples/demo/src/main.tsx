import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { Rubyfield } from "@rubyfield/react";
import type { Annotate, RubyfieldHandle } from "rubyfield";

import { jyutpingAnnotate, loadJapanese, pinyinAnnotate } from "./readings";

import "./style.css";

const languages = {
	mandarin: { label: "Mandarin Pinyin", lang: "zh", rtLang: "zh-Latn-pinyin", text: "我们一起学习中文吧。", annotate: pinyinAnnotate },
	cantonese: { label: "Cantonese Jyutping", lang: "yue", rtLang: "yue-Latn-jyutping", text: "我哋一齊學廣東話吖。", annotate: jyutpingAnnotate },
	japanese: { label: "Japanese Furigana", lang: "ja", rtLang: "ja-Hira", text: "日本語を一緒に勉強しましょう。", annotate: (() => []) as Annotate },
};

type Language = keyof typeof languages;

function App() {
	const [language, setLanguage] = useState<Language>("mandarin");
	const [text, setText] = useState(languages.mandarin.text);
	const [japanese, setJapanese] = useState<Annotate | null>(null);
	const [error, setError] = useState("");
	const editor = useRef<RubyfieldHandle>(null);

	const selected = languages[language];
	const ruby = useMemo(() => ({ rt: { attributes: { lang: selected.rtLang } } }), [selected.rtLang]);

	useEffect(() => {
		if (language === "japanese" && !japanese) {
			loadJapanese().then(annotate => setJapanese(() => annotate)).catch(error => setError(String(error)));
		}
	}, [language, japanese]);

	return <main>
		<h1>Rubyfield</h1>
		<p>Type plain text. Readings appear as you write.</p>
		<fieldset>
			<legend>Reading system</legend>
			{Object.entries(languages).map(([key, value]) =>
				<label key={key}>
					<input
						type="radio"
						name="language"
						value={key}
						checked={language === key}
						onChange={() => {
							setLanguage(key as Language);
							setText(value.text);
						}} />{" "}
					{value.label}
				</label>
			)}
		</fieldset>
		<Rubyfield
			ref={editor}
			content={text}
			onUpdate={setText}
			annotate={language === "japanese" ? japanese ?? selected.annotate : selected.annotate}
			ruby={ruby}
			attributes={{ "lang": selected.lang, "aria-label": selected.label }}
			placeholder="Start typing…" />
		<p role="status">{error || (language === "japanese" && !japanese ? "Loading Japanese dictionary…" : "")}</p>
	</main>;
}

createRoot(document.getElementById("root")!).render(<App />);
