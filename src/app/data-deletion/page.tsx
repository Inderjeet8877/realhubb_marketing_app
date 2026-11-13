export const metadata = {
  title: "Data Deletion Request — Realhubb",
  description: "How to request deletion of your data from the Realhubb platform.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16 prose prose-slate">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Deletion Request</h1>
        <p className="text-sm text-gray-500 mb-10">
          Applies to accounts and data associated with the Realhubb marketing automation platform
          (web and Android app).
        </p>

        <p>
          If you are an authorised Realhubb user, or an individual whose contact information or
          WhatsApp message history is held within the Realhubb platform, you may request deletion of
          that data at any time.
        </p>

        <h2>How to request deletion</h2>
        <p>
          Send an email to{" "}
          <a href="mailto:realhubbmktg@gmail.com?subject=Data%20Deletion%20Request">
            realhubbmktg@gmail.com
          </a>{" "}
          with the subject line &quot;Data Deletion Request&quot;, including:
        </p>
        <ul>
          <li>Your name and, if applicable, the email address associated with your Realhubb account</li>
          <li>The phone number(s) or contact record(s) you want removed, if requesting deletion of contact/message data rather than an account</li>
          <li>Whether you want your full account deleted, or specific data removed while keeping the account active</li>
        </ul>

        <h2>What gets deleted</h2>
        <ul>
          <li><strong>Account deletion</strong>: your Firebase authentication account, access authorisation, and any registered push notification tokens.</li>
          <li><strong>Contact/message data deletion</strong>: the specific contact record(s) and associated WhatsApp conversation history you identify.</li>
        </ul>

        <h2>Timeline</h2>
        <p>
          We will process verified deletion requests within 30 days and confirm completion by email.
        </p>

        <h2>What is retained</h2>
        <p>
          Some records may be retained where required for legal, accounting, or fraud-prevention
          purposes (for example, records of a completed broadcast campaign for billing reconciliation),
          for a limited period after which they are permanently deleted.
        </p>
      </div>
    </main>
  );
}
