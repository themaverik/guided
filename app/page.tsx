/* Landing page for Guided. */
import Link from "next/link";
import LandingActions from "@/components/landing/LandingActions";
import "./landing.css";

export const metadata = {
  title: "Guided — guidebook editor",
  description:
    "A simple, minimalist, image-driven, print-ready guidebook editor.",
};

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-card">
        <p className="landing-kicker">
          <span className="hi">Guide</span>book + <span className="hi">Ed</span>
          itor
        </p>
        <h1 className="landing-wordmark">
          Guid<em className="wm-ed">ed</em>
        </h1>
        <p className="landing-title">
          A simple, minimalist, image-driven, print-ready guidebook editor.
        </p>
        <p className="landing-tagline">
          Focus on the content — Guided takes care of the formatting.
        </p>
        <LandingActions />
        <video
          className="landing-video"
          src="/example/guided-pitch.mp4"
          controls
          preload="metadata"
          playsInline
        />
        <footer className="landing-foot">
          <Link href="/terms">Terms of Use</Link>
          <span>·</span>
          <Link href="/privacy">Privacy Policy</Link>
        </footer>
      </div>
    </main>
  );
}
