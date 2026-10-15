import { TEXT_MODEL, openrouter } from './config.mjs';

const system = (voice) => `Jesteś redaktorem newslettera: ${voice}.
Z treści wydania wybierz 3 najciekawsze tematy i zapisz je jako "leady" na Instagram Story.
Zasady:
- po polsku, poprawne polskie znaki, ton zgodny z newsletterem (konkretny, z lekkim humorem, bez korpo-mowy i bez emoji);
- "title": maks. 40 znaków, chwytliwy, bez kropki na końcu;
- "text": 1–2 zdania, łącznie maks. 140 znaków, mówi czytelnikowi, czego się dowie / dlaczego warto przeczytać;
- tylko fakty z wydania, nic nie dopisuj od siebie;
- kolejność: od najmocniejszego tematu.
Odpowiedz wyłącznie JSON-em: {"leads":[{"title":"...","text":"..."},{...},{...}]}`;

/** Three short Polish leads distilled from the issue by a text model. */
export async function writeLeads(post, newsletter) {
  const message = await openrouter({
    model: TEXT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system(newsletter.voice) },
      { role: 'user', content: `Tytuł: ${post.title}${post.subtitle ? `\nPodtytuł: ${post.subtitle}` : ''}\n\nTreść wydania:\n${post.text.slice(0, 30000)}` },
    ],
  });
  const leads = JSON.parse(message.content).leads;
  if (!Array.isArray(leads) || leads.length < 3) throw new Error(`Expected 3 leads, got: ${message.content}`);
  return leads.slice(0, 3).map((l) => ({ title: String(l.title).trim(), text: String(l.text).trim() }));
}
