import { siteSettings } from './site-settings.mjs';

const dateInSeoul = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
const json = (value, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/site-settings') return siteSettings(request, env);
    if (!['/api/visit', '/api/entry'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
    const reading = url.pathname === '/api/entry' && request.method === 'GET';
    if (!reading && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Invalid origin' }, 403);

    const now = new Date();
    const day = dateInSeoul.format(now);
    const db = env.DB;
    const latestEntries = db.prepare('SELECT name, message, created_at AS createdAt FROM guestbook ORDER BY id DESC LIMIT 20');
    if (reading) return json({ entries: (await latestEntries.all()).results });
    let write;
    if (url.pathname === '/api/visit') {
      write = db.prepare('INSERT INTO visits(day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1').bind(day);
    } else {
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ error: 'Expected JSON' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Missing body' }, 400);
      const decoder = new TextDecoder();
      let size = 0;
      let body = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return json({ error: 'Body too large' }, 413);
        }
        body += decoder.decode(value, { stream: true });
      }
      let input;
      try { input = JSON.parse(body + decoder.decode()); }
      catch { return json({ error: 'Invalid JSON' }, 400); }
      const name = typeof input?.name === 'string' ? input.name : '';
      const message = typeof input?.message === 'string' ? input.message : '';
      if (!name.trim() || name.length > 20 || !message.trim() || message.length > 200 || name.includes('\0') || message.includes('\0')) {
        return json({ error: 'Invalid entry' }, 400);
      }
      write = db.prepare('INSERT INTO guestbook(name, message, created_at) VALUES (?, ?, ?)').bind(name.trim(), message.trim(), now.toISOString());
    }
    const [, counts, entries] = await db.batch([
      write,
      db.prepare('SELECT COALESCE(SUM(CASE WHEN day = ? THEN count ELSE 0 END), 0) AS today, COALESCE(SUM(count), 0) AS total FROM visits').bind(day),
      latestEntries
    ]);
    return json({ ...counts.results[0], entries: entries.results });
  }
};
