"use client";

import { getFirebaseAuth } from "@/lib/firebase-client";

/**
 * Browser client for the referral dashboards.
 *
 * Every call carries a fresh Firebase ID token and nothing else: the server
 * decides from that token alone whether the caller is an admin, an
 * influencer, or neither, and which influencer's figures they may see. The
 * dashboards never pass an identity of their own — only filters.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError("AUTH_REQUIRED", 401);
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

const BASE = "/api/referrals/v1";

export async function apiGet<T>(path: string, params: Record<string, string | null> = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const suffix = query.toString() ? `?${query}` : "";
  const response = await fetch(`${BASE}/${path}${suffix}`, { headers: await authHeader() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data?.error ?? "REQUEST_FAILED", response.status);
  return data as T;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data?.error ?? "REQUEST_FAILED", response.status);
  return data as T;
}

/**
 * Downloads a report. The file is built server-side so the browser never
 * holds the underlying rows — only the rendered document the user asked for.
 */
export async function apiDownload(
  path: string,
  params: Record<string, string | null>
): Promise<void> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await fetch(`${BASE}/${path}?${query}`, { headers: await authHeader() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data?.error ?? "REQUEST_FAILED", response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? "africin-report";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Human-readable text for the stable error codes the API returns. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "";
  switch (code) {
    case "AUTH_REQUIRED":
      return "Please sign in again.";
    case "FORBIDDEN":
      return "You do not have access to this.";
    case "INFLUENCER_SUSPENDED":
      return "This referral account is suspended. Contact Africin to reactivate it.";
    case "RATE_LIMITED":
      return "Too many requests. Wait a moment and try again.";
    case "INFLUENCER_EMAIL_TAKEN":
      return "An influencer already exists with that email.";
    case "CODE_TAKEN":
      return "That referral code is already in use.";
    case "INVALID_CODE":
      return "Codes must be 4–24 characters: letters, numbers and single dashes.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "INVALID_COMMISSION_RATE":
      return "Commission must be a whole number of basis points between 0 and 10000.";
    case "INFLUENCER_NOT_FOUND":
      return "That influencer no longer exists.";
    case "NOTHING_TO_UPDATE":
      return "Nothing was changed.";
    default:
      return "Something went wrong. Please try again.";
  }
}
