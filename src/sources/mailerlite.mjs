import { required } from '../config.mjs';

const API = 'https://connect.mailerlite.com/api';

/**
 * Latest sent MailerLite campaign matching the newsletter — same selection as opanuj.ai/newsletter
 * (<private>: sent + regular campaigns whose name/subject contains `titleFilter`).
 */
export async function latestFromMailerlite({ titleFilter, exclude = [] }) {
  const params = new URLSearchParams({ 'filter[status]': 'sent', 'filter[type]': 'regular', limit: '25' });
  const res = await fetch(`${API}/campaigns?${params}`, {
    headers: { Authorization: `Bearer ${required('MAILERLITE_API_KEY')}`, Accept: 'application/json' },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`MailerLite ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);

  const campaigns = (body.data ?? [])
    .filter((c) => `${c.name} ${c.emails?.[0]?.subject ?? ''}`.toLowerCase().includes(titleFilter.toLowerCase()))
    .filter((c) => !exclude.some((re) => re.test(c.name)))
    .sort((a, b) => new Date(b.finished_at ?? b.created_at) - new Date(a.finished_at ?? a.created_at));
  const c = campaigns[0];
  if (!c) throw new Error(`No sent MailerLite campaign matching "${titleFilter}"`);

  const email = c.emails?.[0] ?? {};
  return {
    id: `mailerlite:${c.id}`,
    title: email.subject ?? c.name,
    subtitle: '',
    link: email.preview_url ?? null,
    text: email.plain_text ?? '',
    publishedAt: new Date(c.finished_at ?? c.created_at).toISOString(),
  };
}
