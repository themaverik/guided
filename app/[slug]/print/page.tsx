/*
 * Print / Save-as-PDF route at /<slug>/print — render-only, no editor chrome.
 * Auto-fit runs (via BookCanvas inside A4Book), and assets resolve through the
 * project-scoped asset route.
 */
import { notFound } from "next/navigation";
import A4Book from "@/components/renderer/A4Book";
import { assetBaseFor } from "@/lib/project-routes";
import { loadProjectBook, projectExists } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guidebook — Print" };

export default async function ProjectPrint({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await projectExists(slug))) notFound();
  const book = await loadProjectBook(slug);
  return <A4Book book={book} assetBase={assetBaseFor(slug)} />;
}
