/* Terms of Use for Guided. */
import Link from "next/link";
import "../landing.css";

export const metadata = { title: "Guided — Terms of Use" };

export default function Terms() {
  return (
    <main className="prose">
      <Link className="back" href="/">
        ← Back
      </Link>
      <h1>Terms of Use</h1>
      <p className="muted">Last updated: 30 May 2026</p>

      <p>
        By using Guided you agree to these terms. Guided is an early research
        preview offered as-is, without warranties of any kind.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of everything you create and upload. You are
        responsible for your content and confirm you have the right to use any
        images you upload.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload unlawful content or content you do not have rights to.</li>
        <li>Do not attempt to disrupt, overload, or misuse the service.</li>
      </ul>

      <h2>Availability and data</h2>
      <p>
        Projects are temporary and are removed about 24 hours after inactivity
        (see the <Link href="/privacy">Privacy Policy</Link>). The service may be
        unavailable, change, or be discontinued at any time, and we are not
        liable for lost content — please download anything you want to keep.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, Guided is provided without warranty and
        we are not liable for any damages arising from its use.
      </p>

    </main>
  );
}
