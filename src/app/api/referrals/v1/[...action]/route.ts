import { handleReferralRequest } from "@/lib/referrals/api";

export const dynamic = "force-dynamic";

function action(segments: string[]): string {
  return segments.join("/");
}

export async function GET(req: Request, ctx: { params: Promise<{ action: string[] }> }) {
  return handleReferralRequest(req, action((await ctx.params).action));
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string[] }> }) {
  return handleReferralRequest(req, action((await ctx.params).action));
}
