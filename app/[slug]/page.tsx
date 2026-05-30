/*
 * Project editor at /<slug>. Loads the project's book from the ephemeral store
 * and mounts the two-pane editor scoped to that project. The `demo` project is
 * seeded on first access from the bundled example.
 */
import { notFound } from "next/navigation";
import EditorApp from "@/components/editor/EditorApp";
import { loadExampleBook } from "@/lib/book-io";
import {
  loadProjectBook,
  projectExists,
  seedProject,
  sweepExpired,
} from "@/lib/project-store";

export const dynamic = "force-dynamic";

export default async function ProjectEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await sweepExpired();

  if (!(await projectExists(slug))) {
    if (slug === "demo") {
      await seedProject("demo", "Demo guidebook", await loadExampleBook());
    } else {
      notFound();
    }
  }

  const book = await loadProjectBook(slug);
  return <EditorApp initialBook={book} projectSlug={slug} />;
}
