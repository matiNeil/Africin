/**
 * Digital Asset Links — what makes `https://www.africin.tv/r/<CODE>` open the
 * Android app instead of Chrome (an App Link).
 *
 * Env-driven for the same reasons as the Apple document next door: signing
 * fingerprints are deployment configuration, and an unconfigured deployment
 * should serve nothing rather than something wrong.
 *
 * Note the fingerprints are a list on purpose — an app signed by Play App
 * Signing has both an upload certificate and a Play-managed signing
 * certificate, and a build installed from a debug keystore has a third.
 * Listing only one is the usual reason App Links verify in production and
 * fail on every development build.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = process.env.ANDROID_SHA256_CERT_FINGERPRINTS?.split(",")
    .map((print) => print.trim().toUpperCase())
    .filter(Boolean);

  if (!packageName || !fingerprints?.length) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return Response.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
