import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface PurchaseEmailParams {
  to: string;
  contentTitle: string;
  amount: number;
  currency?: string;
  contentId: string;
  isLive?: boolean;
  paidAt?: string;
}

export async function sendPurchaseConfirmation({
  to,
  contentTitle,
  amount,
  currency = "USD",
  contentId,
  isLive = false,
  paidAt,
}: PurchaseEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping confirmation email");
    return;
  }

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://africin.vercel.app";
  const accessUrl = isLive ? `${BASE_URL}/live/${contentId}` : `${BASE_URL}/watch/${contentId}`;
  const dateStr = paidAt
    ? new Date(paidAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Africin Ticket</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo / header -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <span style="font-size:22px;font-weight:800;letter-spacing:0.1em;color:#ffffff;text-transform:uppercase;">AFRICIN</span>
              <div style="width:32px;height:2px;background:#cc0000;margin:8px auto 0;"></div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border:1px solid #222;border-radius:16px;padding:36px 32px;">

              <!-- Checkmark -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;width:56px;height:56px;background:#16a34a22;border:1px solid #16a34a44;border-radius:50%;line-height:56px;text-align:center;font-size:24px;">✓</div>
              </div>

              <h1 style="margin:0 0 6px;text-align:center;color:#ffffff;font-size:20px;font-weight:700;">Payment Confirmed</h1>
              <p style="margin:0 0 28px;text-align:center;color:#71717a;font-size:14px;">${dateStr}</p>

              <!-- Content details -->
              <div style="background:#0a0a0a;border:1px solid #222;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 4px;color:#71717a;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;">${isLive ? "Live Event" : "Film"}</p>
                <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">${contentTitle}</p>
              </div>

              <!-- Amount -->
              <div style="display:flex;justify-content:space-between;border-top:1px solid #222;padding-top:16px;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#71717a;font-size:13px;">Amount Paid</td>
                    <td style="text-align:right;color:#ffffff;font-size:16px;font-weight:700;">$${amount.toFixed(2)} ${currency}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA -->
              <div style="text-align:center;">
                <a href="${accessUrl}" style="display:inline-block;background:#cc0000;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:100px;">
                  ${isLive ? "View Event →" : "Watch Now →"}
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;color:#3f3f46;font-size:12px;">Africin — African Cinema Streaming</p>
              <p style="margin:6px 0 0;color:#3f3f46;font-size:11px;">
                If you did not make this purchase, contact <a href="mailto:support@africin.tv" style="color:#71717a;text-decoration:none;">support@africin.tv</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  try {
    await resend.emails.send({
      from: "Africin <noreply@africin.tv>",
      to,
      subject: `Your ticket: ${contentTitle}`,
      html,
    });
  } catch (err) {
    // Don't fail the webhook if email sending fails
    console.error("Failed to send purchase confirmation email:", err);
  }
}
