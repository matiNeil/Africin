import { handleTvRequest, preflight } from '@/lib/tv-api';
export const runtime = 'nodejs';
export async function POST(req: Request, context: { params: Promise<{ action: string[] }> }) {
  return handleTvRequest(req, (await context.params).action.join('/'));
}
export function OPTIONS(req: Request) { return preflight(req); }
