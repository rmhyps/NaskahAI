import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { documents, projects } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type ProjectPayload = {
  operation?: "save" | "delete";
  project?: {
    id?: string;
    title?: string;
    idea?: string;
    status?: string;
    spec?: unknown;
    documents?: Array<{ name?: string; content?: string }>;
  };
  id?: string;
};

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "Database belum siap. Jalankan migrasi lalu deploy ulang.";
  return message;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sesi pengguna tidak ditemukan." }, 401);
  try {
    const db = getDb();
    const rows = await db.select().from(projects).where(eq(projects.userId, user.userId)).orderBy(desc(projects.updatedAt)).limit(50);
    const ids = rows.map((row) => row.id);
    const docs = ids.length ? await db.select().from(documents).where(inArray(documents.projectId, ids)) : [];
    return reply({
      projects: rows.map((row) => ({
        ...row,
        spec: JSON.parse(row.specJson || "{}"),
        documents: docs.filter((doc) => doc.projectId === row.id).map(({ name, content }) => ({ name, content })),
      })),
    });
  } catch (error) {
    return reply({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sesi pengguna tidak ditemukan." }, 401);
  try {
    const payload = (await request.json()) as ProjectPayload;
    const db = getDb();
    if (payload.operation === "delete") {
      const id = payload.id?.trim();
      if (!id) return reply({ error: "ID proyek wajib diisi." }, 400);
      await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, user.userId)));
      return reply({ deleted: true });
    }

    if (payload.operation !== "save" || !payload.project) return reply({ error: "Payload tidak valid." }, 400);
    const source = payload.project;
    const id = source.id?.trim() || crypto.randomUUID();
    const title = source.title?.trim().slice(0, 160) || "Proyek tanpa judul";
    const idea = source.idea?.trim().slice(0, 12_000) || "";
    const now = new Date().toISOString();
    const existing = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.userId, user.userId))).limit(1);
    if (existing.length) {
      await db.update(projects).set({ title, idea, status: source.status || "draft", specJson: JSON.stringify(source.spec ?? {}), updatedAt: now }).where(and(eq(projects.id, id), eq(projects.userId, user.userId)));
    } else {
      await db.insert(projects).values({ id, userId: user.userId, title, idea, status: source.status || "draft", specJson: JSON.stringify(source.spec ?? {}), createdAt: now, updatedAt: now });
    }
    await db.delete(documents).where(eq(documents.projectId, id));
    const docs = (source.documents ?? []).filter((item) => item.name && typeof item.content === "string").slice(0, 12).map((item) => ({
      id: crypto.randomUUID(), projectId: id, name: item.name!.slice(0, 120), content: item.content!.slice(0, 250_000), createdAt: now, updatedAt: now,
    }));
    if (docs.length) await db.insert(documents).values(docs);
    return reply({ id, savedAt: now });
  } catch (error) {
    return reply({ error: errorMessage(error) }, 500);
  }
}
