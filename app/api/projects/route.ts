/*
 * Projects collection. GET lists projects (newest first); POST creates a new
 * one from a name and returns its slug. Each call opportunistically sweeps
 * expired projects (ADR-005).
 */
import { NextResponse } from "next/server";
import { createProject, listProjects, sweepExpired } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await sweepExpired();
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(req: Request) {
  let name = "";
  try {
    const body = (await req.json()) as { name?: string };
    name = (body.name ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "project name required" }, { status: 400 });
  }
  const meta = await createProject(name);
  return NextResponse.json(meta, { status: 201 });
}
