/*
 * Print / Save-as-PDF route at /<slug>/print — render-only, no editor chrome.
 * Auto-fit runs (via BookCanvas inside A4Book), and assets resolve through the
 * project-scoped asset route.
 */
import { notFound } from "next/navigation";
import A4Book from "@/components/renderer/A4Book";
import { assetBaseFor } from "@/lib/project-routes";
import { loadProjectBook, projectExists } from "@/lib/project-store";
import { pageDimensions } from "@/lib/grid-math";
import { DEFAULT_PAGE_CONFIG } from "@/lib/book-schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    return { title: (await loadProjectBook(slug)).title || "Guidebook" };
  } catch {
    return { title: "Guidebook" };
  }
}

export default async function ProjectPrint({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await projectExists(slug))) notFound();
  const book = await loadProjectBook(slug);
  const { w, h } = pageDimensions(book.pageConfig ?? DEFAULT_PAGE_CONFIG);
  return (
    <>
      <style>{`@page { size: ${w}mm ${h}mm; margin: 0; }`}</style>
      <A4Book book={book} assetBase={assetBaseFor(slug)} />
    </>
  );
}
