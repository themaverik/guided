/*
 * Server-side PDF export. Launches headless Chromium (Playwright), navigates to
 * the project's /<slug>/print route (where auto-fit runs in the browser), and
 * returns a true A4 PDF. Playwright is imported dynamically so the build stays
 * green when it isn't installed; the route returns a helpful 501 in that case.
 *
 * Enable locally:  pnpm add -D playwright  &&  npx playwright install chromium
 */
import { NextResponse } from "next/server";
import { loadProjectBook, projectExists } from "@/lib/project-store";
import { downloadName } from "@/lib/server-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ slug: string }> };

// Chromium renders are expensive; cap concurrent exports so a burst of
// requests can't exhaust the host. Excess requests get a retryable 429.
const MAX_CONCURRENT_EXPORTS = 2;
let activeExports = 0;

// Navigation ceiling for the print page (fonts + auto-fit included).
const GOTO_TIMEOUT_MS = 30_000;

/*
 * The print page is always fetched from this server itself, so the base URL
 * must not come from the client-controlled Host header. Default to loopback;
 * PDF_BASE_URL overrides for deployments where the server can't see itself
 * on localhost.
 */
function printBaseUrl(): string {
  return (
    process.env.PDF_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`
  );
}

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!(await projectExists(slug))) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Dynamic, non-literal specifier: the build does not require Playwright.
  const spec = "playwright";
  let chromium: {
    launch: () => Promise<PwBrowser>;
  };
  try {
    ({ chromium } = (await import(spec)) as { chromium: typeof chromium });
  } catch {
    return NextResponse.json(
      {
        error:
          "PDF export needs Playwright. Run: pnpm add -D playwright && npx playwright install chromium",
      },
      { status: 501 },
    );
  }

  const printUrl = `${printBaseUrl()}/${slug}/print`;

  if (activeExports >= MAX_CONCURRENT_EXPORTS) {
    return NextResponse.json(
      { error: "PDF export busy — try again shortly" },
      { status: 429, headers: { "retry-after": "10" } },
    );
  }
  activeExports++;
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(printUrl, { waitUntil: "networkidle", timeout: GOTO_TIMEOUT_MS });
      // Let webfonts + the auto-fit layout pass settle before printing.
      await page.waitForTimeout(600);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      const name = downloadName((await loadProjectBook(slug)).title, slug);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${name}.pdf"`,
        },
      });
    } finally {
      await browser.close();
    }
  } finally {
    activeExports--;
  }
}

// Minimal structural types for the dynamically-imported Playwright surface.
interface PwPage {
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  pdf: (opts: {
    format: string;
    printBackground: boolean;
    preferCSSPageSize: boolean;
  }) => Promise<Buffer>;
}
interface PwBrowser {
  newPage: () => Promise<PwPage>;
  close: () => Promise<void>;
}
