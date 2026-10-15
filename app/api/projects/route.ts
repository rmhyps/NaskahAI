import { and, desc, eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { ensureSchema, getDb } from "../../../db";
import { documents, projects } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type DocumentItem = { name: string; content: string };
type ProjectRecord = {
  id: string;
  userId: string;
  title: string;
  idea: string;
  status: string;
  spec: unknown;
  documents: DocumentItem[];
  createdAt: string;
  updatedAt: string;
};

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
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), ".data");
const LOCAL_STORAGE_FILE = path.resolve(LOCAL_STORAGE_DIR, "projects.json");

declare global {
  // eslint-disable-next-line no-var
  var __NASKAH_PROJECTS_MEM__: Map<string, ProjectRecord> | undefined;
}

const memoryStore: Map<string, ProjectRecord> =
  globalThis.__NASKAH_PROJECTS_MEM__ ||
  (globalThis.__NASKAH_PROJECTS_MEM__ = new Map());

function readLocalFileProjects(): ProjectRecord[] {
  if (memoryStore.size > 0) {
    return Array.from(memoryStore.values());
  }
  try {
    if (!fs.existsSync(LOCAL_STORAGE_FILE)) return [];
    const content = fs.readFileSync(LOCAL_STORAGE_FILE, "utf-8");
    const list = JSON.parse(content) as ProjectRecord[];
    for (const item of list) {
      memoryStore.set(item.id, item);
    }
    return list;
  } catch {
    return Array.from(memoryStore.values());
  }
}

function writeLocalFileProjects(list: ProjectRecord[]): void {
  for (const item of list) {
    memoryStore.set(item.id, item);
  }
  try {
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    // Memory store retains it even if physical disk write is blocked by worker sandbox
  }
}

export async function GET() {
  const user = await getChatGPTUser().catch(() => null);
  const userId = user?.userId || "local_user";

  try {
    await ensureSchema().catch(() => {});
    const db = getDb();
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt))
      .limit(50);
    const ids = rows.map((row) => row.id);
    const docs = ids.length
      ? await db.select().from(documents).where(inArray(documents.projectId, ids))
      : [];

    return reply({
      projects: rows.map((row) => ({
        ...row,
        spec: JSON.parse(row.specJson || "{}"),
        documents: docs
          .filter((doc) => doc.projectId === row.id)
          .map(({ name, content }) => ({ name, content })),
      })),
      storage: "d1",
    });
  } catch {
    // Fallback ke penyimpanan file lokal jika D1 belum terkonfigurasi
    const fileProjects = readLocalFileProjects().filter((p) => p.userId === userId);
    return reply({
      projects: fileProjects,
      storage: "local-file",
    });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser().catch(() => null);
  const userId = user?.userId || "local_user";

  try {
    const payload = (await request.json()) as ProjectPayload;

    if (payload.operation === "delete") {
      const id = payload.id?.trim();
      if (!id) return reply({ error: "ID proyek wajib diisi." }, 400);

      memoryStore.delete(id);
      try {
        const db = getDb();
        await db
          .delete(projects)
          .where(and(eq(projects.id, id), eq(projects.userId, userId)));
      } catch {
        const list = readLocalFileProjects().filter(
          (p) => !(p.id === id && p.userId === userId)
        );
        writeLocalFileProjects(list);
      }
      return reply({ deleted: true });
    }

    if (payload.operation !== "save" || !payload.project) {
      return reply({ error: "Payload tidak valid." }, 400);
    }

    const source = payload.project;
    const id = source.id?.trim() || crypto.randomUUID();
    const title = source.title?.trim().slice(0, 160) || "Proyek tanpa judul";
    const idea = source.idea?.trim().slice(0, 12_000) || "";
    const now = new Date().toISOString();
    const cleanDocs: DocumentItem[] = (source.documents ?? [])
      .filter((item): item is { name: string; content: string } =>
        Boolean(item?.name && typeof item.content === "string")
      )
      .slice(0, 20)
      .map((item) => ({
        name: item.name.slice(0, 120),
        content: item.content.slice(0, 500_000),
      }));

    try {
      await ensureSchema().catch(() => {});
      const db = getDb();
      const existing = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .limit(1);

      if (existing.length) {
        await db
          .update(projects)
          .set({
            title,
            idea,
            status: source.status || "draft",
            specJson: JSON.stringify(source.spec ?? {}),
            updatedAt: now,
          })
          .where(and(eq(projects.id, id), eq(projects.userId, userId)));
      } else {
        await db.insert(projects).values({
          id,
          userId,
          title,
          idea,
          status: source.status || "draft",
          specJson: JSON.stringify(source.spec ?? {}),
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.delete(documents).where(eq(documents.projectId, id));
      if (cleanDocs.length) {
        await db.insert(documents).values(
          cleanDocs.map((item) => ({
            id: crypto.randomUUID(),
            projectId: id,
            name: item.name,
            content: item.content,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }

      return reply({ id, savedAt: now, storage: "d1" });
    } catch {
      // Fallback ke penyimpanan file lokal disk
      const list = readLocalFileProjects();
      const existingIndex = list.findIndex(
        (p) => p.id === id && p.userId === userId
      );

      const record: ProjectRecord = {
        id,
        userId,
        title,
        idea,
        status: source.status || "draft",
        spec: source.spec ?? {},
        documents: cleanDocs,
        createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        list[existingIndex] = record;
      } else {
        list.unshift(record);
      }

      writeLocalFileProjects(list);
      return reply({ id, savedAt: now, storage: "local-file" });
    }
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : "Kesalahan tidak diketahui." },
      500
    );
  }
}
