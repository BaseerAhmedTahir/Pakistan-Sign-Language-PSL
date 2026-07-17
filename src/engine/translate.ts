/**
 * Rule-based text -> gloss translation engine (seed).
 *
 * This is the Phase 2 layer the renderer was designed to stay ignorant of:
 * its ONLY output is a gloss sequence for SignPlayer.play(). Swapping this
 * module for a statistical/neural engine later changes nothing downstream.
 *
 * Pipeline (each step recorded in the trace):
 *   1. normalize + tokenize (English lowercased; Urdu passes through)
 *   2. greedy longest-match phrase lookup against the lexicon
 *   3. drop function words (articles, copulas, case markers)
 *   4. map to glosses; unknown tokens pass through uppercased — the
 *      renderer fingerspells them (grapheme-aware, so Urdu works)
 *   5. reorder: time words -> front (topicalization), negation -> end,
 *      WH-question words -> end
 *
 * HONESTY NOTE: the reordering rules are approximations from general
 * sign-language linguistics (topic-comment order, WH-final, sentence-final
 * negation), NOT validated PSL grammar. Validating and correcting them
 * with Deaf PSL users is an explicit roadmap item.
 */

export interface Lexicon {
  entries: Record<string, string>;
  stopwords: string[];
  whWords: string[];
  timeWords: string[];
  negation: { words: string[]; gloss: string };
}

export interface TraceStep {
  token: string;
  action: "map" | "drop" | "fingerspell" | "reorder";
  detail: string;
}

export interface Translation {
  glosses: string[];
  trace: TraceStep[];
}

export async function loadLexicon(url = "/engine/lexicon.json"): Promise<Lexicon> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lexicon: HTTP ${res.status}`);
  const lex = (await res.json()) as Lexicon;
  console.info(`[engine] lexicon loaded: ${Object.keys(lex.entries).length} entries`);
  return lex;
}

/** Strip punctuation (Latin + Urdu marks), collapse whitespace, tokenize. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:؟،٫۔'"()[\]{}\-–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function translate(text: string, lexicon: Lexicon): Translation {
  const trace: TraceStep[] = [];
  const tokens = tokenize(text);

  // Multi-word phrase keys, longest first, for greedy matching.
  const phraseKeys = Object.keys(lexicon.entries)
    .filter((k) => k.includes(" "))
    .sort((a, b) => b.split(" ").length - a.split(" ").length);

  const stopwords = new Set(lexicon.stopwords);
  const negationWords = new Set(lexicon.negation.words);

  const glosses: string[] = [];
  let sawNegation = false;

  let i = 0;
  outer: while (i < tokens.length) {
    // 1. Greedy phrase match.
    for (const phrase of phraseKeys) {
      const words = phrase.split(" ");
      if (tokens.slice(i, i + words.length).join(" ") === phrase) {
        const gloss = lexicon.entries[phrase];
        glosses.push(gloss);
        trace.push({ token: phrase, action: "map", detail: `phrase -> ${gloss}` });
        i += words.length;
        continue outer;
      }
    }

    const token = tokens[i];
    i += 1;

    // 2. Negation is collected and re-emitted sentence-final.
    if (negationWords.has(token)) {
      sawNegation = true;
      trace.push({ token, action: "reorder", detail: `negation -> ${lexicon.negation.gloss} at end` });
      continue;
    }

    // 3. Function words are dropped.
    if (stopwords.has(token)) {
      trace.push({ token, action: "drop", detail: "function word" });
      continue;
    }

    // 4. Single-word lookup.
    const gloss = lexicon.entries[token];
    if (gloss) {
      glosses.push(gloss);
      trace.push({ token, action: "map", detail: `-> ${gloss}` });
    } else {
      // 5. Unknown: pass through for the renderer to fingerspell.
      const upper = token.toUpperCase();
      glosses.push(upper);
      trace.push({ token, action: "fingerspell", detail: `unknown -> ${upper}` });
    }
  }

  // 6. Reorder: [time...] [core...] [NOT] [WH...]
  const timeSet = new Set(lexicon.timeWords);
  const whSet = new Set(lexicon.whWords);
  const time = glosses.filter((g) => timeSet.has(g));
  const wh = glosses.filter((g) => whSet.has(g));
  const core = glosses.filter((g) => !timeSet.has(g) && !whSet.has(g));
  if (time.length > 0) trace.push({ token: time.join(" "), action: "reorder", detail: "time words -> front" });
  if (wh.length > 0) trace.push({ token: wh.join(" "), action: "reorder", detail: "WH words -> end" });

  const result = [...time, ...core];
  if (sawNegation) result.push(lexicon.negation.gloss);
  result.push(...wh);

  return { glosses: result, trace };
}
