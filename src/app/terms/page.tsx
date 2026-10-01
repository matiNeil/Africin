import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Africin",
  description:
    "Terms & Conditions for the Africin mobile application and subscription service.",
};

const SUPPORT_EMAIL = "support@africin.tv";
const LAST_UPDATED = "June 17, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-20">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10">
          <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">Legal</span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-foreground tracking-tight mt-2">
            Terms &amp; Conditions
          </h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-3 mb-4" />
          <p className="text-subtle text-xs uppercase tracking-widest">Last updated: {LAST_UPDATED}</p>
        </header>

        {/* Body */}
        <div className="space-y-9 text-muted text-sm leading-relaxed">
          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              Welcome to Africin (&ldquo;Africin&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
              These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the Africin mobile
              application and related services (the &ldquo;Service&rdquo;). By creating an account, ticking the
              acceptance box, or otherwise accessing or using the Service, you confirm that you have read,
              understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree, you may
              not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years old to use the Service, and at least 18 years old (or the age of majority
              in your jurisdiction) to make purchases. If you are under the age of majority, you may only use the
              Service with the involvement and consent of a parent or legal guardian who agrees to be bound by these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">3. Your Account</h2>
            <p>
              You are responsible for providing accurate information when registering and for keeping your login
              credentials secure. You are responsible for all activity that occurs under your account. Africin
              accounts are personal to you and may not be shared, sold, or transferred. Notify us immediately of any
              unauthorised use of your account.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">4. Subscriptions, Pricing &amp; Payments</h2>
            <p>
              Access to the Service is provided through a recurring subscription plan. Prices are shown in the
              Service (typically in US Dollars) and may change at any time with notice. Subscriptions renew
              automatically until cancelled. Payments are processed by third-party payment providers (including, on
              iOS, Apple&apos;s In-App Purchase system); by subscribing you also agree to the applicable
              provider&apos;s terms. Subscriptions purchased through the App Store are billed to your Apple ID
              account and renew automatically unless cancelled at least 24 hours before the end of the current
              period, via your Apple ID account settings. Except where required by law, subscription payments are
              final and non-refundable once the billing period has begun.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">5. Licence to Access Content</h2>
            <p>
              Subject to your compliance with these Terms and payment of any applicable fees, Africin grants you a
              limited, personal, non-exclusive, non-transferable, revocable licence to stream and, where offered,
              download purchased content solely for your own private, non-commercial viewing. This licence does not
              transfer any ownership rights to you.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">6. Offline Downloads</h2>
            <p>
              Where downloads are available, content is stored on your device for offline viewing only and remains
              subject to these Terms and to the content protections built into the Service. Downloads may expire,
              become unavailable, or require periodic online revalidation. You may not extract, copy, or transfer
              downloaded files outside of the Africin app.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">7. Prohibited Conduct</h2>
            <p>
              You agree not to: (a) copy, record, screenshot, screen-capture, download (except via features we
              provide), reproduce, broadcast, or publicly perform any content; (b) redistribute, resell, or share
              access to content or your account; (c) circumvent, disable, or interfere with any security,
              geo-restriction, or content-protection measures; (d) reverse engineer or attempt to derive source code
              or media URLs from the Service; or (e) use the Service for any unlawful purpose. Violation may result
              in immediate suspension or termination.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">8. Intellectual Property</h2>
            <p>
              All content available through the Service, including films, live events, artwork, trademarks, logos,
              and software, is owned by Africin or its licensors and is protected by copyright and other
              intellectual property laws. Except for the limited licence granted above, no rights are granted to
              you.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">9. Third-Party Services</h2>
            <p>
              The Service relies on third-party providers for features such as authentication, payments, and video
              delivery. Your use of those features may be subject to the relevant third party&apos;s terms and
              privacy practices. Africin is not responsible for third-party services and does not control their
              content or availability.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">10. Service Availability &amp; Changes</h2>
            <p>
              We strive to keep the Service available but do not guarantee uninterrupted or error-free operation. We
              may add, modify, suspend, or discontinue any part of the Service, including titles or live events, at
              any time without liability to you.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">11. Disclaimers</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any
              kind, whether express or implied, including merchantability, fitness for a particular purpose, and
              non-infringement, to the maximum extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">12. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Africin and its affiliates will not be liable for any
              indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data,
              or goodwill arising from your use of, or inability to use, the Service. Our total liability for any
              claim will not exceed the amount you paid to Africin in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">13. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time if you breach these Terms or if we
              discontinue the Service. You may stop using the Service at any time. Provisions that by their nature
              should survive termination (e.g. intellectual property, disclaimers, and limitation of liability) will
              continue to apply.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">14. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <a href="/privacy" className="text-red-400 hover:text-red-300 transition-colors">
                Privacy Policy
              </a>
              , which explains how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">15. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we make material changes, we will update the
              &ldquo;Last updated&rdquo; date above and, where appropriate, notify you in the app. Your continued use
              of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">16. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of Zimbabwe, without regard to
              its conflict-of-law principles. Any disputes will be subject to the exclusive jurisdiction of the
              courts located in Zimbabwe, unless otherwise required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-xl text-foreground mb-3">17. Contact Us</h2>
            <p>
              If you have questions about these Terms, contact us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-red-400 hover:text-red-300 transition-colors">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
