import { FieldPath, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { TvError } from './tv-policy';
import { id } from './tv-security';
function safeUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  try { return new URL(value).protocol === 'https:' ? value : ''; } catch { return ''; }
}
export function card(docId: string, data: DocumentData) {
  return { id: docId, title: String(data.title ?? ''), thumbnail: safeUrl(data.thumbnail), backdrop: safeUrl(data.backdrop ?? data.thumbnail),
    year: data.year ?? null, genre: Array.isArray(data.genre) ? data.genre.filter((v: unknown) => typeof v === 'string') : [],
    type: data.type === 'series' ? 'series' : 'movie', country: String(data.country ?? ''), rating: String(data.rating ?? ''),
    duration: String(data.duration ?? '') };
}
export async function content(docId: string) {
  const doc = await adminDb.collection('content').doc(id(docId)).get();
  // Missing status remains published for compatibility with existing mobile
  // records. Listing requires backfilling explicit status on legacy records.
  if (!doc.exists || (doc.data()?.status != null && doc.data()?.status !== 'published')) throw new TvError('CONTENT_UNAVAILABLE', 404);
  return doc;
}
export async function catalogue(body: Record<string, unknown>) {
  const pageSize = 36;
  const search = typeof body.search === 'string' ? body.search.trim().toLowerCase().slice(0, 80) : '';
  let query = adminDb.collection('content').where('status', '==', 'published');
  if (body.type === 'movie' || body.type === 'series') query = query.where('type', '==', body.type);
  if (typeof body.genre === 'string' && body.genre.length <= 60) query = query.where('genre', 'array-contains', body.genre);
  if (search) query = query.where('titleSearch', '>=', search).where('titleSearch', '<=', search + '\uf8ff').orderBy('titleSearch');
  query = query.orderBy(FieldPath.documentId());
  if (body.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(String(body.cursor), 'base64url').toString());
      if (cursor.search !== search || cursor.type !== (body.type ?? '') || cursor.genre !== (body.genre ?? '')) throw new Error();
      query = search ? query.startAfter(cursor.titleSearch, id(cursor.id)) : query.startAfter(id(cursor.id));
    } catch { throw new TvError('INVALID_CURSOR'); }
  }
  const docs = await query.limit(pageSize + 1).get();
  const page = docs.docs.slice(0, pageSize);
  const last = page.at(-1);
  return { items: page.map(d => card(d.id, d.data())), cursor: docs.size > pageSize && last ? Buffer.from(JSON.stringify({
    id: last.id, titleSearch: last.data().titleSearch, search, type: body.type ?? '', genre: body.genre ?? '',
  })).toString('base64url') : null };
}
export async function details(body: Record<string, unknown>) {
  const doc = await content(id(body.contentId));
  const data = doc.data()!;
  const offset = Number(body.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new TvError('INVALID_OFFSET');
  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  return { ...card(doc.id, data), description: String(data.description ?? ''),
    episodes: episodes.slice(offset, offset + 36).map((e: DocumentData) => ({ id: String(e.id), title: String(e.title ?? ''),
      description: String(e.description ?? ''), thumbnail: safeUrl(e.thumbnail), duration: String(e.duration ?? '') })),
    nextOffset: offset + 36 < episodes.length ? offset + 36 : null };
}
export function streamUid(data: DocumentData) {
  if (typeof data.cloudflareUid === 'string' && /^[a-f0-9]{32}$/i.test(data.cloudflareUid)) return data.cloudflareUid;
  try {
    const url = new URL(data.videoUrl);
    if (!/^(?:[a-z0-9-]+\.)?(?:cloudflarestream\.com|videodelivery\.net)$/.test(url.hostname)) throw new Error();
    const uid = url.pathname.split('/')[1];
    if (/^[a-f0-9]{32}$/i.test(uid)) return uid;
  } catch { /* Unsupported provider fails closed. */ }
  throw new TvError('VIDEO_UNAVAILABLE', 404);
}
