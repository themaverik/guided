/* Privacy Policy for Guided. */
import Link from "next/link";
import "../landing.css";

export const metadata = { title: "Guided — Privacy Policy" };

export default function Privacy() {
  return (
    <main className="prose">
      <Link className="back" href="/">
        ← Back
      </Link>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 2 Aug 2026</p>

      <p>
        Guided is built to be private by default. We only store the content you
        create — the text you type and the images you upload — so that the editor
        can show and print your guidebook.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>The guidebook content you enter (titles, instructions, callouts).</li>
        <li>Images you upload, kept with your project.</li>
        <li>
          A local backup of your work is kept in your own browser
          (localStorage) so it can be recovered after a crash. It never leaves
          your device and you can clear it from the home page.
        </li>
      </ul>
      <p>
        Screenshots you upload may themselves contain personal data (names,
        email addresses, faces, account details visible in a captured screen).
        Please do not upload images containing personal or sensitive data you
        are not entitled to share; uploaded images are deleted together with
        the project.
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>
          We do not ask for or collect personal details — no account, name, or
          email is required to use Guided today.
        </li>
        <li>We do not sell data, and we do not show ads.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Projects are temporary. A project is automatically deleted about one
        hour after you stop editing it, and you can delete a project
        immediately at any time (the Discard action on the home page, or
        deleting it from the editor). To keep a guidebook, export it as a PDF
        or a project .zip; once downloaded, the copy is yours and is no longer
        stored by us.
      </p>

      <h2>Changes</h2>
      <p>
        Guided is an early research preview, and this policy may change as the
        product evolves. If we begin collecting any additional information in the
        future, we will update this page first.
      </p>

    </main>
  );
}
