import { EDIT_MODEL, TEXT_MODEL, openrouter } from './config.mjs';
import { POLISH_SLOP_PATTERNS, skill } from './copyedit.mjs';

// The slide cards are sized for these limits (src/carousel-layout.mjs).
export const LIMITS = {
  hook: { title: 70, text: 90 },
  problem: { title: 60, text: 170 },
  solution: { title: 60, text: 170 },
  deepening: { title: 60, point: 80 },
  cta: { title: 60, text: 120 },
  caption: 150, // Without the hashtags.
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

const WRITER = (voice) => `Jesteś redaktorem: ${voice}. Z długiego materiału robisz pionową rolkę na Instagram: 5 plansz z tekstem, które zmieniają się same, więc każdą trzeba przeczytać w kilka sekund.
Materiał może być w dowolnym języku. Rolka jest zawsze po polsku, z poprawnymi polskimi znakami, bez emoji i bez myślników (—, –).

Kolejne plansze:
1. hook: "title" nazywa problem czytelnika tak, żeby rozpoznał w nim swoją sytuację, najlepiej krótkim pytaniem, np. "Chaos w pracy z kilkoma agentami naraz?". Nie opisuje produktu ani jego popularności: gwiazdki, pobrania i liczby użytkowników nie są hookiem, nawet jeśli są w materiale. "text" obiecuje odpowiedź i nie powtarza słów z "title". "title" maks. ${LIMITS.hook.title} znaków, "text" maks. ${LIMITS.hook.text} znaków.
2. problem: co konkretnie nie działa i kogo to kosztuje. "title" maks. ${LIMITS.problem.title}, "text" maks. ${LIMITS.problem.text} znaków.
3. solution: jedna, najważniejsza rada z materiału, wyjaśniona tak, żeby dało się ją zastosować od razu: co zrobić, jak i jaki będzie efekt. Nie lista nazw technik ani spis treści materiału. "title" maks. ${LIMITS.solution.title}, "text" maks. ${LIMITS.solution.text} znaków.
4. deepening: 3 najciekawsze szczegóły, liczby lub niuanse, których nie było na planszach 2 i 3. "title" maks. ${LIMITS.deepening.title}, "points": dokładnie 3, każdy maks. ${LIMITS.deepening.point} znaków.
5. cta: "title" to jeden konkretny następny krok dla czytelnika, wynikający z materiału (np. co wypróbować, co zapisać, co przeczytać). "text" to pytanie do czytelnika związane z tematem i prośba o komentarz i udostępnienie, np. "A jaka technika jest kluczowa w twoim workflow z AI? Podziel się komentarzem i udostępnij znajomym". "title" maks. ${LIMITS.cta.title}, "text" maks. ${LIMITS.cta.text} znaków. Adres strony dodaje szablon, więc nie wpisuj żadnych linków.

"caption": opis rolki, krótki i z pazurem: 1-2 zdania, maks. ${LIMITS.caption} znaków bez hashtagów. Nie streszcza plansz i nie wylicza nazw technik ani pojęć, tylko daje konkretny powód, żeby obejrzeć. Na końcu, po pustej linii, do ${LIMITS.hashtags} hashtagów. Hashtagi to istniejące frazy, których ludzie szukają: bez spacji w środku, małe litery, bez polskich znaków, najpierw konkretne dla tematu (np. nazwy narzędzi), bez wymyślonych słów i bez #viral, #fyp i podobnych.

Zasady:
- tylko fakty z materiału, nic nie dopisuj od siebie; nazwy, liczby i mechanizmy zamiast ogólników;
- każda plansza wnosi coś nowego i prowadzi do następnej;
- każda plansza i każdy punkt dają wartość samodzielnie: odbiorca bez kontekstu, który nie czytał materiału, ma z nich wynieść konkretną wiedzę albo krok do wykonania. To nie jest skrót materiału: nie wyliczaj haseł, z których nic nie wynika;
- nazwa techniki lub pojęcie (np. Context Engineering, feedback loop) tylko razem z wyjaśnieniem prostym językiem, co to znaczy w praktyce; jeśli brakuje na to miejsca, opisz samo działanie i pomiń nazwę;
- bez kropki na końcu "title".

${FORMAT}
Jeśli materiał nie ma treści merytorycznej, odpowiedz {"error":"<krótko dlaczego>"}.`;

const EDITOR = `${skill}

---

# Zadanie w tym projekcie (ma pierwszeństwo przed formatem odpowiedzi powyżej)

Robisz "Edit" 5 plansz rolki na Instagram i jej opisu, po polsku: stosuj powyższe reguły do ich polskich odpowiedników. Najczęstsze wzorce, zawsze do usunięcia:
${POLISH_SLOP_PATTERNS}

- Zachowaj liczbę, kolejność i role plansz, liczbę punktów oraz temat każdej planszy.
- Tytuł hooka nazywa problem czytelnika i może być pytaniem: to nie jest pytanie retoryczne do usunięcia. Nie zamieniaj go na fakt o produkcie ani na liczbę (gwiazdki, pobrania, użytkownicy). "text" hooka nie powtarza słów z tytułu.
- "text" planszy cta to pytanie do czytelnika i prośba o komentarz i udostępnienie: zostaw je, to nie jest pytanie retoryczne ani slop.
- Limity znaków: hook title ${LIMITS.hook.title}, text ${LIMITS.hook.text}; problem i solution title ${LIMITS.problem.title}, text ${LIMITS.problem.text}; deepening title ${LIMITS.deepening.title}, każdy punkt ${LIMITS.deepening.point}; cta title ${LIMITS.cta.title}, text ${LIMITS.cta.text}; caption ${LIMITS.caption} bez hashtagów.
- Ogólniki zamieniaj na konkrety wyłącznie z materiału poniżej. Nie dopisuj faktów spoza niego.
- Bez emoji, bez myślników (—, –), bez linków. Hashtagi na końcu "caption" zostaw bez zmian.
- Każda plansza ma dawać wartość odbiorcy bez kontekstu. Listę haseł lub nazw bez wyjaśnienia zamień na konkretną radę z materiału: co zrobić, jak i jaki będzie efekt.
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
  const captionText = (caption ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').trim();
  if (!captionText || captionText.length > LIMITS.caption) out.push(`caption must be 1-${LIMITS.caption} characters without hashtags (is ${captionText.length})`);
  const tags = (caption ?? '').trim().split(/\n\s*\n/).pop();
  if (tags.includes('#') && tags.split(/\s+/).some((word) => !word.startsWith('#'))) out.push('caption must end with a paragraph of hashtags only, with no spaces inside a hashtag');
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
      { role: 'user', content: `Rolka do redakcji:\n${JSON.stringify(draft, null, 2)}\n\nJedyne źródło faktów:\n${sourceBlock(source)}` },
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
