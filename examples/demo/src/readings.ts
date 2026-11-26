import { pinyin } from "pinyin-pro";
import { getJyutpingList } from "to-jyutping";
import { toHiragana } from "wanakana";

import type { Annotate } from "rubyfield";
import { segmentsToRanges } from "rubyfield";

import type { IpadicFeatures, Tokenizer } from "kuromoji";

export const pinyinAnnotate: Annotate = text => segmentsToRanges(pinyin(text, { type: "all" }).map(({ origin, pinyin, isZh }) => [origin, isZh ? pinyin : null]));
export const jyutpingAnnotate: Annotate = text => segmentsToRanges(getJyutpingList(text));
export const furiganaAnnotate = (tokenizer: Tokenizer<IpadicFeatures>): Annotate => text => segmentsToRanges(tokenizer.tokenize(text).map(({ surface_form, reading }) => [surface_form, /\p{Script=Han}/u.test(surface_form) && reading ? toHiragana(reading) : null]));

// Share one lazy dictionary load across language switches.
let japanese: Promise<Annotate> | undefined;

export function loadJapanese(): Promise<Annotate> {
	return japanese ||= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = `${import.meta.env.BASE_URL}kuromoji/kuromoji.js`;
		script.addEventListener("error", () => reject(new Error("Could not load the Japanese dictionary.")));
		script.addEventListener("load", () => {
			const kuromoji = (window as unknown as { kuromoji: typeof import("kuromoji") }).kuromoji;
			kuromoji.builder({ dicPath: `${import.meta.env.BASE_URL}kuromoji/dict/` }).build((error, tokenizer) => {
				if (error) reject(error);
				else resolve(furiganaAnnotate(tokenizer));
			});
		});
		document.head.append(script);
	});
}
