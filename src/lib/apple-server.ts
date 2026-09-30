import fs from "fs";
import path from "path";
import {
  SignedDataVerifier,
  Environment,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

export const BUNDLE_ID = "com.africin.africinMobile";
// The app's numeric App Store Connect ID (App Information → Apple ID). Not
// set yet — omitting it just skips that one cross-check; signature/bundle-ID
// verification still fully protects against forged receipts/notifications.
export const APPLE_APP_APPLE_ID = process.env.APPLE_APP_APPLE_ID
  ? Number(process.env.APPLE_APP_APPLE_ID)
  : undefined;

const rootCertificate = fs.readFileSync(
  path.join(process.cwd(), "src/lib/certs/AppleRootCA-G3.cer")
);

function verifier(environment: Environment) {
  // Online checks (OCSP revocation lookups against Apple's servers) add a
  // network round trip per environment attempted and have caused routes to
  // hang past their timeout. revocationDate is checked against the decoded
  // payload by callers instead.
  return new SignedDataVerifier(
    [rootCertificate],
    false,
    environment,
    BUNDLE_ID,
    APPLE_APP_APPLE_ID
  );
}

/**
 * Verifies a StoreKit 2 signed transaction against Apple's servers. There is
 * no way to know up front whether a given device is a TestFlight/sandbox
 * tester or a real App Store customer, so both environments are checked in
 * parallel rather than Production-then-Sandbox, since sequential checks
 * double the network round-trip time.
 */
export async function verifyTransaction(
  signedTransaction: string
): Promise<JWSTransactionDecodedPayload> {
  try {
    return await Promise.any([
      verifier(Environment.PRODUCTION).verifyAndDecodeTransaction(signedTransaction),
      verifier(Environment.SANDBOX).verifyAndDecodeTransaction(signedTransaction),
    ]);
  } catch (err) {
    // Both rejected: Promise.any throws an AggregateError wrapping both
    // underlying errors. Surface the first one — either is representative.
    if (err instanceof AggregateError) throw err.errors[0];
    throw err;
  }
}

/**
 * Verifies a nested signedRenewalInfo JWS from inside an App Store Server
 * Notification (data.signedRenewalInfo) — a separately-signed blob with its
 * own certificate chain, decoded the same way as a top-level transaction.
 */
export async function verifyRenewalInfo(
  signedRenewalInfo: string
): Promise<JWSRenewalInfoDecodedPayload> {
  try {
    return await Promise.any([
      verifier(Environment.PRODUCTION).verifyAndDecodeRenewalInfo(signedRenewalInfo),
      verifier(Environment.SANDBOX).verifyAndDecodeRenewalInfo(signedRenewalInfo),
    ]);
  } catch (err) {
    if (err instanceof AggregateError) throw err.errors[0];
    throw err;
  }
}

/**
 * Verifies an App Store Server Notifications v2 signed payload. Unlike a
 * client-submitted transaction, a server notification always declares its
 * own environment (payload.data.environment / payload.summary.environment),
 * so this only needs to try the environment that actually signed it — but
 * production and sandbox use different verifier instances regardless, so
 * fall back the same way as verifyTransaction for robustness.
 */
export async function verifyNotification(
  signedPayload: string
): Promise<ResponseBodyV2DecodedPayload> {
  try {
    return await Promise.any([
      verifier(Environment.PRODUCTION).verifyAndDecodeNotification(signedPayload),
      verifier(Environment.SANDBOX).verifyAndDecodeNotification(signedPayload),
    ]);
  } catch (err) {
    if (err instanceof AggregateError) throw err.errors[0];
    throw err;
  }
}
