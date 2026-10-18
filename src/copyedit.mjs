import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EDIT_MODEL, openrouter } from './config.mjs';

// The vendored no-ai-slop skill (.claude/skills/no-ai-slop, MIT) is the editor's rulebook.
const SKILL_DIR = new URL('../.claude/skills/no-ai-slop/', import.meta.url);
const skill = ['SKILL.md', 'eval.md'].map((f) => readFileSync(new URL(f, SKILL_DIR), 'utf8')).join('\n\n---\n\n');

const LIMITS = { title: 40, text: 140 };

const task = `${skill}

---

# Zadanie w tym projekcie (ma pierwszeństwo przed formatem odpowiedzi powyżej)

Robisz "Edit" na trzech leadach do Instagram Story newslettera. Leady są po polsku: stosuj powyższe
reguły do ich polskich odpowiedników. Najczęstsze w polskich leadach, zawsze do usunięcia:
- kontrast binarny: "To nie X, to Y", "Nie X, tylko Y", "Problemem nie jest X, lecz Y", "Nie wystarczy X. Liczy się Y" → napisz wprost samo Y;
- metakomentarz i zapowiedzi: "Zobacz, jak…", "Sprawdź, co…", "Dowiesz się…", "O tym, co…", "Przegląd…" → od razu podaj, co konkretnie jest w materiale;
- puszenie i ogólniki: "Kluczowe:", "Co ważne,", "w dzisiejszym świecie", "rewolucja", "przełom", "game changer", "realne", "sensowne";
- pytania retoryczne, puenty-aforyzmy, dramatyczne fragmenty zdań, myślniki.
Wykonaj checklistę z eval.md w myślach, zanim odpowiesz, i sprawdź każdy lead osobno pod kątem listy wyżej.

- Zachowaj liczbę i kolejność leadów oraz temat każdego z nich.
- "title": maks. ${LIMITS.title} znaków, bez kropki na końcu. "text": maks. ${LIMITS.text} znaków. Nie przekraczaj limitów, karty są na nie zwymiarowane.
- Ogólniki zamieniaj na konkrety (nazwy, liczby, mechanizmy) wyłącznie z treści wydania poniżej. Nie dopisuj faktów spoza niej.
- Poprawna polszczyzna i polskie znaki, bez emoji, bez myślników (—, –).
- Lead, który już jest konkretny i naturalny, zostaw bez zmian.

Odpowiedz wyłącznie JSON-em:
{"leads":[{"title":"...","text":"..."},{...},{...}],"changes":"krótko, co zmieniłeś i dlaczego (to jest sekcja What changed)"}`;

/** Changes with the skill, the task above or the model, so cached polished leads are redone after any of them changes. */
export const EDIT_HASH = createHash('sha1').update(EDIT_MODEL + task).digest('hex').slice(0, 8);

/** Copy-edit pass over the drafted leads with the no-ai-slop skill. Falls back to the draft per field if a limit is broken. */
export async function polishLeads(draft, post) {
  const message = await openrouter({
    model: EDIT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: task },
      {
        role: 'user',
        content: `Leady do redakcji:\n${JSON.stringify({ leads: draft }, null, 2)}\n\nTreść wydania (jedyne źródło faktów):\nTytuł: ${post.title}\n${post.text.slice(0, 30000)}`,
      },
    ],
  });
  // Not every model honours json_object mode; tolerate a ```json fence.
  const parsed = JSON.parse(message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  if (!Array.isArray(parsed.leads) || parsed.leads.length !== draft.length) throw new Error(`Copy editor returned unexpected leads: ${message.content}`);
  if (parsed.changes) console.log(`Copy edit (no-ai-slop): ${parsed.changes}`);
  return draft.map((d, i) => {
    const out = { ...d };
    for (const k of ['title', 'text']) {
      const v = String(parsed.leads[i]?.[k] ?? '').trim();
      if (v && v.length <= LIMITS[k]) out[k] = v;
      else console.warn(`Copy edit: kept draft ${k} of lead ${i + 1} (edited version ${v.length} chars, limit ${LIMITS[k]})`);
    }
    return out;
  });
}
