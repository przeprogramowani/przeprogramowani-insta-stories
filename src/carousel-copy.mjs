import { EDIT_MODEL, TEXT_MODEL, openrouter } from './config.mjs';
import { POLISH_SLOP_PATTERNS, skill } from './copyedit.mjs';

// The slide cards are sized for these limits (src/carousel-layout.mjs).
export const LIMITS = {
  hook: { title: 70, text: 110 },
  problem: { title: 60, text: 300 },
  solution: { title: 60, text: 300 },
  deepening: { title: 60, point: 110 },
  cta: { title: 60, text: 160 },
  caption: 1800,
  hashtags: 5,
};
export const ROLES = ['hook', 'problem', 'solution', 'deepening', 'cta'];

const MAX_SOURCE_CHARS = 60000;

const FORMAT = `Odpowiedz wyłącznie JSON-em:
{"slides":[
{"role":"hook","title":"...","text":"..."},
{"role":"problem","title":"...","text":"..."},
{"role":"solution","title":"...","text":"..."},
{"role":"deepening","title":"...","points":["...","...","..."]},
{"role":"cta","title":"...","text":"..."}
],"caption":"..."}`;

const WRITER = (voice) => `Jesteś redaktorem: ${voice}. Z długiego materiału robisz 5-stronicową karuzelę na Instagram, która ma sens jako samodzielny, krótki artykuł.
Materiał może być w dowolnym języku. Karuzela jest zawsze po polsku, z poprawnymi polskimi znakami, bez emoji i bez myślników (—, –).

Kolejne strony:
1. hook: najmocniejsza, konkretna teza albo liczba z materiału, która zatrzymuje kciuk. "title" maks. ${LIMITS.hook.title} znaków, "text" maks. ${LIMITS.hook.text} znaków.
2. problem: co konkretnie nie działa i kogo to kosztuje. "title" maks. ${LIMITS.problem.title}, "text" maks. ${LIMITS.problem.text} znaków.
3. solution: główna odpowiedź materiału i jak działa. "title" maks. ${LIMITS.solution.title}, "text" maks. ${LIMITS.solution.text} znaków.
4. deepening: 3 najciekawsze szczegóły, liczby lub niuanse, których nie było na stronach 2 i 3. "title" maks. ${LIMITS.deepening.title}, "points": dokładnie 3, każdy maks. ${LIMITS.deepening.point} znaków.
5. cta: jeden konkretny następny krok dla czytelnika, wynikający z materiału (np. co wypróbować, co zapisać, co przeczytać). "title" maks. ${LIMITS.cta.title}, "text" maks. ${LIMITS.cta.text} znaków. Adres strony dodaje szablon, więc nie wpisuj żadnych linków.

"caption": opis posta, maks. ${LIMITS.caption} znaków: 2-4 krótkie akapity rozwijające temat, a na końcu, po pustej linii, do ${LIMITS.hashtags} hashtagów. Hashtagi to frazy, których ludzie szukają: małe litery, bez polskich znaków, najpierw konkretne dla tematu, bez #viral, #fyp i podobnych.

Zasady:
- tylko fakty z materiału, nic nie dopisuj od siebie; nazwy, liczby i mechanizmy zamiast ogólników;
- każda strona wnosi coś nowego i prowadzi do następnej;
- bez kropki na końcu "title".

${FORMAT}
Jeśli materiał nie ma treści merytorycznej, odpowiedz {"error":"<krótko dlaczego>"}.`;

const EDITOR = `${skill}

---

# Zadanie w tym projekcie (ma pierwszeństwo przed formatem odpowiedzi powyżej)

Robisz "Edit" 5-stronicowej karuzeli na Instagram, po polsku: stosuj powyższe reguły do ich polskich odpowiedników. Najczęstsze wzorce, zawsze do usunięcia:
${POLISH_SLOP_PATTERNS}

- Zachowaj liczbę, kolejność i role stron, liczbę punktów oraz temat każdej strony.
- Limity znaków: hook title ${LIMITS.hook.title}, text ${LIMITS.hook.text}; problem i solution title ${LIMITS.problem.title}, text ${LIMITS.problem.text}; deepening title ${LIMITS.deepening.title}, każdy punkt ${LIMITS.deepening.point}; cta title ${LIMITS.cta.title}, text ${LIMITS.cta.text}; caption ${LIMITS.caption}.
- Ogólniki zamieniaj na konkrety wyłącznie z materiału poniżej. Nie dopisuj faktów spoza niego.
- Bez emoji, bez myślników (—, –), bez linków. Hashtagi na końcu "caption" zostaw bez zmian.
- Fragment, który już jest konkretny i naturalny, zostaw bez zmian.

${FORMAT.replace('"caption":"..."}', '"caption":"...","changes":"krótko, co zmieniłeś i dlaczego (to jest sekcja What changed)"}')}`;

// Not every model honours json_object mode; tolerate a ```json fence.
const parseJson = (s) => JSON.parse(s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));

const sourceBlock = (source) => `Tytuł: ${source.title}\n\nMateriał:\n${source.text.slice(0, MAX_SOURCE_CHARS)}`;

/** Everything wrong with a carousel's copy, as readable sentences; empty when it can be rendered. */
export function copyProblems({ slides, caption }) {
  if (!Array.isArray(slides) || slides.length !== ROLES.length) return [`expected ${ROLES.length} slides`];
  const out = [];
  slides.forEach((slide, i) => {
    const role = ROLES[i];
    if (slide.role !== role) out.push(`slide ${i + 1} must have role "${role}"`);
    const limits = LIMITS[role];
    if (!slide.title?.trim() || slide.title.length > limits.title) out.push(`${role}.title must be 1-${limits.title} characters (is ${slide.title?.length ?? 0})`);
    if (role === 'deepening') {
      if (!Array.isArray(slide.points) || slide.points.length !== 3) out.push('deepening.points must have exactly 3 items');
      else slide.points.forEach((p, j) => { if (!p?.trim() || p.length > limits.point) out.push(`deepening.points[${j}] must be 1-${limits.point} characters (is ${p?.length ?? 0})`); });
    } else if (!slide.text?.trim() || slide.text.length > limits.text) out.push(`${role}.text must be 1-${limits.text} characters (is ${slide.text?.length ?? 0})`);
  });
  if (!caption?.trim() || caption.length > LIMITS.caption) out.push(`caption must be 1-${LIMITS.caption} characters (is ${caption?.length ?? 0})`);
  if ((caption?.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > LIMITS.hashtags) out.push(`caption may have at most ${LIMITS.hashtags} hashtags`);
  return out;
}

/** First draft by the text model. Overlong copy gets one retry with the exact problems, then it's an error. */
async function draftCopy(source, newsletter) {
  const messages = [
    { role: 'system', content: WRITER(newsletter.voice) },
    { role: 'user', content: sourceBlock(source) },
  ];
  for (let attempt = 1; ; attempt++) {
    const message = await openrouter({ model: TEXT_MODEL, response_format: { type: 'json_object' }, messages });
    const parsed = parseJson(message.content);
    if (parsed.error) throw new Error(`Carousel writer found no usable content: ${parsed.error}`);
    const problems = copyProblems(parsed);
    if (!problems.length) return { slides: parsed.slides, caption: parsed.caption };
    if (attempt >= 2) throw new Error(`Carousel writer broke the limits twice: ${problems.join('; ')}`);
    console.warn(`Carousel draft needs a retry: ${problems.join('; ')}`);
    messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: `Popraw i odeślij cały JSON. Błędy: ${problems.join('; ')}` });
  }
}

/** The no-ai-slop pass. An edited field that breaks a limit keeps its draft, as with the Story leads. */
async function polishCopy(draft, source) {
  const message = await openrouter({
    model: EDIT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EDITOR },
      { role: 'user', content: `Karuzela do redakcji:\n${JSON.stringify(draft, null, 2)}\n\nJedyne źródło faktów:\n${sourceBlock(source)}` },
    ],
  });
  const edited = parseJson(message.content);
  if (edited.changes) console.log(`Copy edit (no-ai-slop): ${edited.changes}`);
  const slides = draft.slides.map((slide, i) => {
    const merged = { ...slide };
    for (const key of ['title', 'text', 'points']) {
      if (slide[key] === undefined || edited.slides?.[i]?.[key] === undefined) continue;
      const candidate = { ...merged, [key]: edited.slides[i][key] };
      const probe = draft.slides.map((d, j) => (j === i ? candidate : d));
      if (copyProblems({ slides: probe, caption: draft.caption }).length === 0) merged[key] = candidate[key];
      else console.warn(`Copy edit: kept draft ${slide.role}.${key} (edited version breaks a limit)`);
    }
    return merged;
  });
  const captionOk = edited.caption && copyProblems({ slides: draft.slides, caption: edited.caption }).length === 0;
  if (edited.caption && !captionOk) console.warn('Copy edit: kept draft caption (edited version breaks a limit)');
  return { slides, caption: captionOk ? edited.caption : draft.caption };
}

/** Long-form source → { slides, caption } in Polish, ready to render. */
export async function writeCarousel(source, newsletter) {
  if (source.text.length > MAX_SOURCE_CHARS) console.warn(`Source has ${source.text.length} characters; only the first ${MAX_SOURCE_CHARS} are used.`);
  return polishCopy(await draftCopy(source, newsletter), source);
}
