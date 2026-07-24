export const metadata = {
  title: "Privacy Policy — Realhubb",
  description: "Privacy Policy for the Realhubb marketing automation platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16 prose prose-slate">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: 18 July 2026</p>

        <p>
          Realhubb Ventures (&quot;Realhubb&quot;, &quot;we&quot;, &quot;us&quot;) operates the Realhubb marketing
          automation platform, available as a web application at realhubb.co.in and as an Android
          application (together, the &quot;Service&quot;). This Service is an internal business tool used by
          authorised Realhubb team members to manage WhatsApp messaging, Meta advertising accounts,
          and contact lists on behalf of Realhubb&apos;s clients and prospects. It is not available for
          public sign-up — access is restricted to individually authorised users.
        </p>
        <p>
          This policy explains what information the Service collects, why, and how it is handled.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>1.1 Account information</h3>
        <p>
          When an authorised user signs in, we collect their name and email address via Firebase
          Authentication (Google sign-in or email/password). Access is checked against an internal
          allow-list; unauthorised accounts are signed out immediately and no further data is
          processed for them.
        </p>

        <h3>1.2 Contact and lead information</h3>
        <p>
          The Service is used to manage contact lists (name, phone number, email, tags) uploaded by
          authorised users, typically from CSV/Excel exports of leads or customers. This data is
          provided by the user operating the Service, not collected directly from the individuals
          themselves by us.
        </p>

        <h3>1.3 WhatsApp message content</h3>
        <p>
          The Service integrates with the Meta WhatsApp Business Platform to send and receive WhatsApp
          messages on behalf of Realhubb&apos;s connected business phone number(s). This includes message
          text, sender/recipient phone numbers, message timestamps, and delivery/read status, which are
          stored so that the authorised user can view conversation history and manage replies.
        </p>

        <h3>1.4 Meta advertising account data</h3>
        <p>
          If an authorised user connects a Meta Ads account, we access ad account, campaign, and
          performance data via the Meta Graph API (through an OAuth connection the user explicitly
          authorises) to display analytics inside the Service.
        </p>

        <h3>1.5 Device and push notification data</h3>
        <p>
          To deliver notifications when a new WhatsApp reply arrives, the Service registers a device
          push token (via Firebase Cloud Messaging) for the authorised user&apos;s device or browser. No
          other device identifiers are collected.
        </p>

        <h3>1.6 Uploaded media</h3>
        <p>
          Images uploaded for use as WhatsApp message template headers are stored with our media
          hosting provider (Cloudinary) and referenced by URL from the Service.
        </p>

        <h2>2. How We Use Information</h2>
        <ul>
          <li>To authenticate and authorise access to the Service</li>
          <li>To send, receive, and display WhatsApp messages and conversation history</li>
          <li>To manage contact lists and bulk messaging campaigns</li>
          <li>To display Meta advertising performance analytics</li>
          <li>To deliver push notifications for new WhatsApp replies</li>
          <li>To diagnose and fix technical issues with message delivery</li>
        </ul>
        <p>We do not sell any data collected through the Service, to anyone, for any purpose.</p>

        <h2>3. Third Parties We Share Data With</h2>
        <p>Data passes through the following third-party infrastructure providers as part of normal Service operation:</p>
        <ul>
          <li>
            <strong>Meta Platforms, Inc.</strong> — WhatsApp Business Platform (message sending/receiving)
            and Meta Graph API (advertising analytics). Use of Meta&apos;s platforms is additionally governed
            by Meta&apos;s own terms and policies.
          </li>
          <li>
            <strong>Google Firebase</strong> (Google LLC) — authentication, application database
            (Firestore), and push notification delivery (Cloud Messaging).
          </li>
          <li>
            <strong>Cloudinary</strong> — hosting for uploaded template header images.
          </li>
          <li>
            <strong>Google Sheets / Google Apps Script</strong> — storage for uploaded contact lists.
          </li>
        </ul>
        <p>
          We do not share data with any party for their own independent marketing or advertising
          purposes.
        </p>

        <h2>4. Data Storage and Security</h2>
        <p>
          Data is transmitted over encrypted (HTTPS/TLS) connections. Application data is stored in
          Google Firebase infrastructure with access-controlled security rules restricting reads and
          writes to authorised, authenticated requests. Access to the Service itself requires
          authentication and is further restricted to an internal allow-list of authorised users.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          Conversation history, contact lists, and template data are retained for as long as the
          associated Realhubb account remains active, or until deletion is requested (see Section 7).
          Push notification tokens are automatically removed once they become invalid (e.g. after an
          app is uninstalled).
        </p>

        <h2>6. Children&apos;s Privacy</h2>
        <p>
          The Service is a business tool intended for use by adult, authorised personnel only. It is
          not directed at, and we do not knowingly collect information from, children under 13.
        </p>

        <h2>7. Your Rights / Requesting Deletion</h2>
        <p>
          Authorised users, or any individual whose contact information or message history is held
          within the Service, may request access to, correction of, or deletion of their data by
          contacting us at the address below. We will respond to verified requests within a reasonable
          time.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be reflected by updating
          the &quot;Last updated&quot; date above.
        </p>

        <h2>9. Contact Us</h2>
        <p>
          For any question about this policy or to make a data request, contact:{" "}
          <a href="mailto:realhubbmktg@gmail.com">realhubbmktg@gmail.com</a>
        </p>
      </div>
    </main>
  );
}
