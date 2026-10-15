import { getChatGPTUser } from "../../chatgpt-auth";
import { DOCUMENT_GUIDES, PLANNER_SYSTEM_PROMPT } from "../../../lib/planner-prompt";
import {
  getRouterConfig,
  normalizeRouterUrl,
  sanitizeErrorMessage,
} from "../../../lib/nine-router";

type Answer = { question: string; answer: string };
const DOCUMENT_ORDER = [
  "PRD.md",
  "architecture.md",
  "database.md",
  "api.md",
  "design.md",
  "implementation-plan.md",
  "decisions.md",
] as const;
type DocumentName = (typeof DOCUMENT_ORDER)[number];
type DocumentRecommendation = {
  name: DocumentName;
  included: boolean;
  required: boolean;
  reason: string;
};
const REQUIRED_DOCUMENTS = new Set<DocumentName>([
  "PRD.md",
  "design.md",
  "decisions.md",
]);
const DEFAULT_INCLUDED_DOCUMENTS = new Set<DocumentName>([
  "PRD.md",
  "architecture.md",
  "design.md",
  "implementation-plan.md",
  "decisions.md",
]);
const REQUIRED_DOCUMENT_REASONS: Partial<Record<DocumentName, string>> = {
  "PRD.md": "Wajib sebagai acuan ruang lingkup, fitur, dan acceptance criteria.",
  "design.md": "Wajib untuk merancang alur pengguna, antarmuka, dan UI states.",
  "decisions.md": "Wajib untuk mencatat keputusan, asumsi, dan hal yang belum diputuskan.",
};
type InterviewQuestion = {
  id: string;
  label: string;
  question: string;
  why?: string;
  options: string[];
  selectionMode: "single" | "multiple";
};
type RawInterviewQuestion = {
  id?: unknown;
  label?: unknown;
  question?: unknown;
  why?: unknown;
  options?: unknown;
  selectionMode?: unknown;
};
type RawDocumentRecommendation = {
  name?: unknown;
  included?: unknown;
  reason?: unknown;
};
type RawInterviewResult = {
  ready?: unknown;
  summary?: unknown;
  questions?: unknown;
  recommendedDocuments?: unknown;
};
type AiPayload = {
  action?: "interview" | "generate";
  model?: string;
  idea?: string;
  answers?: Answer[];
  summary?: string;
  documentName?: string;
  priorDocuments?: Record<string, string>;
  customInstructions?: string;
};

const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const cleanJsonText = (value: string) =>
  value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

export function sanitizeMermaidBlocks(markdown: string): string {
  return markdown.replace(/```mermaid([\s\S]*?)```/gi, (_match, code) => {
    // Quote unquoted node labels: id[some text] -> id["some text"]
    // Avoid double quoting if already quoted: id["some text"]
    const cleanedCode = code.replace(
      /([a-zA-Z0-9_-]+)\[([^"\]\r\n][^\]\r\n]*?)\]/g,
      (_m: string, id: string, label: string) => {
        const safeLabel = label.trim().replace(/"/g, "'");
        return `${id}["${safeLabel}"]`;
      }
    );
    return `\`\`\`mermaid${cleanedCode}\`\`\``;
  });
}

export function cleanMarkdownDocument(value: string): string {
  let text = value.trim();

  // Hapus pembungkus code fence paling luar jika seluruh dokumen dibungkus ```markdown ... ```
  const outerFenceMatch = text.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (outerFenceMatch) {
    text = outerFenceMatch[1].trim();
  } else if (/^```(?:markdown|md)?\s*\r?\n/i.test(text) && /\r?\n```\s*$/i.test(text)) {
    text = text.replace(/^```(?:markdown|md)?\s*\r?\n/i, "");
    text = text.replace(/\r?\n```\s*$/i, "");
  }

  // Hapus pembuka percakapan AI seperti "Berikut adalah dokumen PRD.md:"
  text = text.replace(
    /^(?:Tentu[,\s]+|Baik[,\s]+)?(?:Berikut (?:adalah )?(?:isi (?:dari )?)?(?:draf |dokumen )?[a-zA-Z0-9_.-]+:?|Ini (?:adalah )?dokumen.*?:?)\s*\r?\n+/i,
    ""
  );

  // Hapus penutup percakapan AI seperti "Semoga membantu!"
  text = text.replace(
    /\r?\n+(?:Semoga (?:dokumen ini )?membantu.*|Jika ada (?:revisi|pertanyaan).*)$/i,
    ""
  );

  return sanitizeMermaidBlocks(text.trim());
}

function isDocumentName(value: unknown): value is DocumentName {
  return (
    typeof value === "string" &&
    DOCUMENT_ORDER.some((name) => name === value)
  );
}

function fallbackDocumentRecommendations(): DocumentRecommendation[] {
  return DOCUMENT_ORDER.map((name) => ({
    name,
    included: DEFAULT_INCLUDED_DOCUMENTS.has(name),
    required: REQUIRED_DOCUMENTS.has(name),
    reason:
      REQUIRED_DOCUMENT_REASONS[name] ??
      (DEFAULT_INCLUDED_DOCUMENTS.has(name)
        ? "Direkomendasikan sebagai bagian paket perencanaan dasar aplikasi."
        : "Belum diperlukan berdasarkan informasi yang tersedia."),
  }));
}

function normalizeDocumentRecommendations(
  value: unknown
): DocumentRecommendation[] {
  if (!Array.isArray(value)) return fallbackDocumentRecommendations();

  const recommendations = new Map<DocumentName, RawDocumentRecommendation>();
  for (const item of value as RawDocumentRecommendation[]) {
    if (isDocumentName(item?.name) && !recommendations.has(item.name)) {
      recommendations.set(item.name, item);
    }
  }

  if (!recommendations.size) return fallbackDocumentRecommendations();

  return DOCUMENT_ORDER.map((name) => {
    const item = recommendations.get(name);
    const required = REQUIRED_DOCUMENTS.has(name);
    const reason =
      typeof item?.reason === "string" && item.reason.trim()
        ? item.reason.trim()
        : REQUIRED_DOCUMENT_REASONS[name] ??
          (item?.included === true
            ? "Direkomendasikan berdasarkan kebutuhan proyek yang telah dikonfirmasi."
            : "Tidak direkomendasikan dari informasi yang tersedia saat ini.");

    return {
      name,
      included: required || item?.included === true,
      required,
      reason,
    };
  });
}

function normalizeInterviewResult(content: string) {
  const parsed = JSON.parse(cleanJsonText(content)) as RawInterviewResult;
  const rawQuestions = Array.isArray(parsed.questions)
    ? (parsed.questions as RawInterviewQuestion[])
    : [];
  const questions: InterviewQuestion[] = [];

  for (const [index, item] of rawQuestions.entries()) {
    if (questions.length === 3) break;

    const question =
      typeof item.question === "string" ? item.question.trim() : "";
    if (!question) continue;

    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `question-${index + 1}`;
    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim()
        : `Pertanyaan ${index + 1}`;
    const why =
      typeof item.why === "string" && item.why.trim()
        ? item.why.trim()
        : undefined;
    const options = Array.isArray(item.options)
      ? Array.from(
          new Set(
            item.options
              .filter((option): option is string => typeof option === "string")
              .map((option) => option.trim())
              .filter(Boolean)
          )
        )
      : [];

    questions.push({
      id,
      label,
      question,
      why,
      options,
      selectionMode:
        item.selectionMode === "multiple" ? "multiple" : "single",
    });
  }

  return {
    ready: parsed.ready === true,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    questions,
    recommendedDocuments:
      parsed.ready === true
        ? normalizeDocumentRecommendations(parsed.recommendedDocuments)
        : [],
  };
}

function demoInterview(payload: AiPayload) {
  if ((payload.answers ?? []).length >= 3) {
    return {
      mode: "demo",
      ready: true,
      summary: `Proyek berangkat dari ide: ${payload.idea}. Kebutuhan dasar telah cukup untuk membuat draf awal. Keputusan yang belum lengkap akan ditandai sebagai asumsi di dokumen.`,
      questions: [],
      recommendedDocuments: fallbackDocumentRecommendations(),
    };
  }
  return {
    mode: "demo",
    ready: false,
    summary:
      "Mode demo memakai pertanyaan dasar. Hubungkan 9Router untuk wawancara yang sepenuhnya adaptif.",
    questions: [
      {
        id: "goal",
        label: "Tujuan utama",
        question: "Hasil paling penting apa yang harus bisa dicapai pengguna?",
        why: "Jawaban ini menentukan ruang lingkup MVP.",
        selectionMode: "single",
        options: [
          "Menyelesaikan satu tugas utama",
          "Mengelola proses berulang",
          "Menampilkan informasi",
        ],
      },
      {
        id: "users",
        label: "Pengguna",
        question: "Siapa pengguna utama aplikasi ini?",
        why: "Role dan kebutuhan UI bergantung pada pengguna.",
        selectionMode: "multiple",
        options: ["Saya sendiri", "Tim kecil", "Pengguna umum"],
      },
      {
        id: "platform",
        label: "Platform",
        question: "Aplikasi ini paling utama akan dipakai di mana?",
        why: "Platform memengaruhi desain dan stack.",
        selectionMode: "single",
        options: ["Web", "Mobile", "Desktop"],
      },
    ],
    recommendedDocuments: [],
  };
}

function demoDocument(name: string, payload: AiPayload) {
  const idea = payload.idea?.trim() || "Proyek baru";
  const answers = (payload.answers ?? [])
    .map((item) => `- **${item.question}:** ${item.answer}`)
    .join("\n");
  const sections: Record<string, string> = {
    "PRD.md": `# PRD: ${idea}\n\n## Status dokumen\n\nDraf awal dalam mode demo. Perlu ditinjau sebelum dianggap final.\n\n## Ringkasan\n\n${payload.summary || idea}\n\n## Kebutuhan yang diketahui\n\n${answers || "- Belum ada jawaban kebutuhan."}\n\n## Ruang lingkup MVP\n\n- F-001: Alur utama yang menyelesaikan tujuan inti pengguna.\n- F-002: Umpan balik yang jelas untuk kondisi berhasil dan gagal.\n\n## Non-goals\n\n- Fitur yang belum dikonfirmasi tidak termasuk MVP.\n\n## Acceptance criteria\n\n- [ ] Pengguna dapat menyelesaikan alur utama tanpa langkah yang ambigu.\n- [ ] Sistem menampilkan validasi dan error yang dapat dipahami.\n\n## Pertanyaan terbuka\n\n- Stack dan detail integrasi perlu dikonfirmasi.`,
    "architecture.md": `# Arsitektur: ${idea}\n\n## Status\n\nRancangan konseptual mode demo.\n\n## Komponen\n\n\`\`\`mermaid\nflowchart LR\n  U["Pengguna"] --> UI["Antarmuka"]\n  UI --> A["Logika aplikasi"]\n  A --> D["Penyimpanan opsional"]\n\`\`\`\n\n## Catatan keputusan\n\nArsitektur final mengikuti platform, kebutuhan data, dan integrasi yang dikonfirmasi.`,
    "database.md": `# Model Data: ${idea}\n\n## Status kebutuhan\n\nKebutuhan database belum dapat dipastikan dalam mode demo. Jangan membuat tabel sebelum objek data dan siklus hidupnya dikonfirmasi.\n\n## Pertanyaan terbuka\n\n- Data apa yang harus bertahan lintas sesi?\n- Siapa yang boleh membaca dan mengubah data?`,
    "api.md": `# API: ${idea}\n\n## Status kebutuhan\n\nBelum ada kontrak API yang dikonfirmasi. Endpoint tidak dibuat hanya untuk memenuhi template.\n\n## Informasi yang diperlukan\n\n- Integrasi eksternal\n- Metode autentikasi\n- Bentuk input dan output\n- Kondisi error`,
    "design.md": `# Desain Produk: ${idea}\n\n## Prinsip\n\n- Fokus pada satu aksi utama per layar.\n- Gunakan bahasa yang mudah dipahami pengguna.\n- Sediakan state kosong, loading, berhasil, dan gagal.\n\n## Alur awal\n\n\`\`\`mermaid\nflowchart TD\n  A["Masuk"] --> B["Melakukan tugas utama"]\n  B --> C["Meninjau hasil"]\n  C --> D["Selesai atau revisi"]\n\`\`\`\n\n## Catatan\n\nStruktur halaman final mengikuti platform dan target pengguna yang dikonfirmasi.`,
    "implementation-plan.md": `# Rencana Implementasi: ${idea}\n\n## Fase 1: Validasi kebutuhan\n\n- [ ] Konfirmasi tujuan dan pengguna utama.\n- [ ] Kunci ruang lingkup MVP.\n- [ ] Verifikasi kebutuhan data dan integrasi.\n\n## Fase 2: Desain\n\n- [ ] Finalisasi user flow.\n- [ ] Finalisasi arsitektur.\n- [ ] Tentukan acceptance criteria.\n\n## Fase 3: Implementasi\n\n- [ ] Implementasikan fitur MVP sesuai dependency.\n- [ ] Uji acceptance criteria.\n\n> Dokumen ini adalah rencana. Belum ada pekerjaan implementasi yang dijalankan.`,
    "decisions.md": `# Keputusan Proyek: ${idea}\n\n## Dikonfirmasi\n\n${answers || "Belum ada keputusan yang dikonfirmasi."}\n\n## Asumsi\n\n- Draf awal memprioritaskan MVP sederhana.\n\n## Belum diputuskan\n\n- Stack final\n- Kebutuhan penyimpanan\n- Integrasi eksternal`,
    "PROMPT.md": `# DIREKTIF EKSEKUSI AI CODING AGENT\n\n## Peran dan Batasan Wewenang\nAnda bertindak sebagai Lead Software Architect dan Senior Full-Stack Engineer yang bertugas mengimplementasikan proyek: **${idea}** dari fondasi awal hingga siap produksi.\n\n## Sumber Kebenaran Tunggal (Ground Truth)\nSebelum menulis atau mengubah kode, Anda WAJIB membaca dan mematuhi seluruh dokumen perencanaan yang tersedia di repositori:\n- \`PRD.md\`: Katalog fitur dengan ID stabil, kriteria penerimaan, dan batasan ruang lingkup.\n- \`architecture.md\`: Komponen sistem, aliran data, dan keputusan teknologi.\n- \`database.md\`: Model data, relasi, constraint, dan siklus hidup penyimpanan.\n- \`api.md\`: Kontrak endpoint, metode HTTP, format payload, dan kode status.\n- \`design.md\`: Alur interaksi, navigasi, dan penanganan lima kondisi UI (loading, empty, success, error, unauthorized).\n- \`implementation-plan.md\`: Urutan fase pengerjaan dan checklist deliverable.\n- \`decisions.md\`: Keputusan terkonfirmasi, asumsi teknis, dan pertanyaan terbuka.\n\n## Protokol Kerja Utama\n1. Kepatuhan Ruang Lingkup: Dilarang keras menambahkan fitur, dependensi, atau tombol di luar spesifikasi tanpa instruksi pengguna.\n2. Keterlacakan ID Fitur: Setiap modul, fungsi, dan pengujian harus merujuk ke ID fitur terkait (misalnya F-001).\n3. Eksekusi Bertahap: Selesaikan pekerjaan secara berurutan sesuai fase pada implementation-plan.md.\n4. Verifikasi Siklus Tertutup: Tulis pengujian unit dan jalankan verifikasi build tanpa error sebelum menyatakan suatu fase selesai.`,
  };
  return sections[name] ?? `# ${name}\n\nDokumen belum tersedia.`;
}

function compactPriorDocuments(
  priorDocuments: Record<string, string>
): Record<string, string> {
  const compacted: Record<string, string> = {};
  let remainingBudget = 18_000;

  for (const name of DOCUMENT_ORDER) {
    const content = priorDocuments[name]?.trim();
    if (!content || remainingBudget <= 0) continue;

    const perDocumentBudget = Math.min(6_000, remainingBudget);
    if (content.length <= perDocumentBudget) {
      compacted[name] = content;
      remainingBudget -= content.length;
      continue;
    }

    const structuralLines = content
      .split("\n")
      .filter((line) =>
        /^(#{1,4}\s|\|)|\bF-\d{3}\b|Dikonfirmasi|Rekomendasi|Asumsi|Belum diputuskan/i.test(
          line
        )
      )
      .join("\n");
    const openingBudget = Math.min(3_500, perDocumentBudget);
    const opening = content.slice(0, openingBudget).trimEnd();
    const structureBudget = perDocumentBudget - opening.length;
    const structure = structuralLines.slice(0, structureBudget).trim();

    compacted[name] = structure
      ? `${opening}\n\n[Kutipan struktur dan ID penting]\n${structure}`
      : opening;
    remainingBudget -= compacted[name].length;
  }

  return compacted;
}

function formatNetworkError(
  error: unknown,
  model: string,
  apiKey: string
): Error {
  const message = error instanceof Error ? error.message : "Koneksi gagal";
  return new Error(
    `Gagal menghubungi 9Router untuk model ${model}: ${sanitizeErrorMessage(
      message,
      apiKey
    )}`
  );
}

async function callRouter(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<string | null> {
  const { baseUrl, apiKey, defaultModel } = getRouterConfig();
  if (!baseUrl || !apiKey || !model) return null;

  const endpoint = normalizeRouterUrl(baseUrl, "/v1/chat/completions");

  const executeCall = async (targetModel: string): Promise<string> => {
    const primaryPayload = {
      model: targetModel,
      messages,
      reasoning_effort: "high",
      max_tokens: 8000,
      stream: false,
    };
    const fallbackPayload = {
      model: targetModel,
      messages,
      max_tokens: 8000,
      stream: false,
    };

    const send = async (body: typeof primaryPayload | typeof fallbackPayload) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return { response, raw: await response.text() };
    };

    let response: Response;
    let raw: string;
    let usedFallback = false;

    try {
      ({ response, raw } = await send(primaryPayload));
    } catch (error) {
      usedFallback = true;
      try {
        ({ response, raw } = await send(fallbackPayload));
      } catch (fallbackError) {
        throw formatNetworkError(fallbackError, targetModel, apiKey);
      }
    }

    // Jika 400 / 422 (misal penolakan reasoning_effort atau invalid payload), coba fallback tanpa reasoning_effort
    const isPayloadRejected =
      !response.ok && (response.status === 400 || response.status === 422);

    const isUpstreamTimeout =
      !response.ok &&
      (response.status === 408 ||
        response.status === 504 ||
        /timeout|timed out/i.test(raw));

    if (!usedFallback && (isPayloadRejected || isUpstreamTimeout)) {
      usedFallback = true;
      try {
        ({ response, raw } = await send(fallbackPayload));
      } catch (error) {
        throw formatNetworkError(error, targetModel, apiKey);
      }
    }

    if (!response.ok) {
      let detail = raw.slice(0, 500);
      try {
        const parsed = JSON.parse(raw) as {
          error?: { message?: string } | string;
        };
        if (typeof parsed?.error === "string") detail = parsed.error;
        else if (parsed?.error?.message) detail = parsed.error.message;
      } catch {
        // tetap gunakan detail potongan teks
      }
      const cleanDetail = sanitizeErrorMessage(detail, apiKey);
      throw new Error(
        `9Router error ${response.status} pada model ${targetModel}: ${cleanDetail}`
      );
    }

    const result = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`9Router mengembalikan respons kosong untuk model ${targetModel}.`);
    }
    return content;
  };

  try {
    return await executeCall(model);
  } catch (initialError) {
    // Jika model yang diminta gagal karena not found / unsupported / credentials, dan ada defaultModel lain yang valid
    if (
      defaultModel &&
      defaultModel !== model &&
      initialError instanceof Error &&
      /404|not found|not supported|no active credentials/i.test(initialError.message)
    ) {
      try {
        return await executeCall(defaultModel);
      } catch {
        throw initialError;
      }
    }
    throw initialError;
  }
}

export async function POST(request: Request) {
  // Sesi ChatGPT diperiksa jika ada, namun tidak memblokir pengguna lokal/publik
  await getChatGPTUser().catch(() => null);

  try {
    const payload = (await request.json()) as AiPayload;
    const idea = payload.idea?.trim() ?? "";
    if (!idea || idea.length > 12_000) {
      return reply(
        { error: "Ide proyek wajib diisi dan maksimal 12.000 karakter." },
        400
      );
    }

    const { defaultModel } = getRouterConfig();
    const chosenModel =
      typeof payload.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : defaultModel;

    if (!chosenModel) {
      return reply(
        {
          error:
            "Model AI belum ditentukan dan tidak ada model default pada environment.",
        },
        400
      );
    }

    if (payload.action === "interview") {
      const prompt = `IDE PROYEK:\n${idea}\n\nJAWABAN SEBELUMNYA:\n${JSON.stringify(
        payload.answers ?? [],
        null,
        2
      )}\n\nINSTRUKSI KHUSUS:\n${
        payload.customInstructions || "Tidak ada"
      }\n\nAnalisis kebutuhan yang belum jelas. Jika informasi belum cukup, set ready=false dan ajukan maksimal tiga pertanyaan baru. Jangan ulangi pertanyaan yang sudah terjawab dan tidak ada batas jumlah putaran selama masih ada keputusan penting yang belum jelas. Jika informasi sudah cukup untuk draf yang bertanggung jawab, set ready=true, kosongkan questions, dan rekomendasikan paket dokumen. PRD.md, design.md, dan decisions.md wajib included=true. Nilai kebutuhan architecture.md, database.md, api.md, dan implementation-plan.md dari konteks proyek; jangan memaksakan dokumen yang tidak relevan. Tentukan selectionMode="multiple" jika beberapa opsi dapat berlaku bersamaan, misalnya daftar fitur, jenis konten, role, atau platform target. Gunakan selectionMode="single" jika opsi saling eksklusif atau pengguna harus memilih satu keputusan utama, misalnya teknologi utama, metode autentikasi, atau prioritas. Keluarkan HANYA JSON valid: {"ready":boolean,"summary":"ringkasan ruang lingkup dan keputusan","questions":[{"id":"slug","label":"label singkat","question":"pertanyaan","why":"alasan singkat","selectionMode":"single|multiple","options":["opsi 1","opsi 2","opsi 3"]}],"recommendedDocuments":[{"name":"PRD.md|architecture.md|database.md|api.md|design.md|implementation-plan.md|decisions.md","included":boolean,"reason":"alasan singkat berbasis kebutuhan proyek"}]}. Saat ready=true, sertakan tepat satu entri untuk ketujuh nama dokumen.`;

      const content = await callRouter(
        [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        chosenModel
      );

      if (!content) return reply(demoInterview(payload));
      return reply({ mode: "ai", ...normalizeInterviewResult(content) });
    }

    if (payload.action === "generate") {
      const name = payload.documentName ?? "";
      if (!(name in DOCUMENT_GUIDES)) {
        return reply({ error: "Jenis dokumen tidak dikenali." }, 400);
      }

      const priorDocs = compactPriorDocuments(payload.priorDocuments ?? {});
      const priorSection = Object.entries(priorDocs)
        .map(([docName, docContent]) => `### Ringkasan ${docName}:\n${docContent}`)
        .join("\n\n");

      const answersFormatted = (payload.answers ?? [])
        .map((a) => `- **${a.question}:** ${a.answer}`)
        .join("\n");

      const prompt = `Tulis isi lengkap dan final untuk file dokumen: ${name}

PANDUAN KHUSUS UNTUK ${name}:
${DOCUMENT_GUIDES[name]}

KONTEKS PROYEK:
- Ide Inti: ${idea}
- Ringkasan Terkonfirmasi: ${payload.summary || idea}
- Instruksi Khusus: ${payload.customInstructions || "Tidak ada"}

KEPUTUSAN WAWANCARA:
${answersFormatted || "- Belum ada keputusan spesifik"}

${priorSection ? `DOKUMEN SEBELUMNYA (Jaga konsistensi):\n${priorSection}\n\n` : ""}
PETUNJUK FORMAT OUTPUT:
- Keluarkan HANYA Markdown file tersebut dimulai dari heading level 1 (# Judul).
- Dilarang membungkus seluruh dokumen dengan code fence \`\`\`markdown atau \`\`\`.
- Dilarang menulis percakapan pembuka atau penutup di luar dokumen.
- Gunakan tabel Markdown jika menyajikan matriks/katalog fitur atau daftar endpoint.
- Jika membuat diagram alur, gunakan blok kode \`\`\`mermaid dengan \`flowchart TD\` atau \`flowchart LR\` dan semua teks node wajib diapit tanda kutip: id["Nama Node"].`;

      const content = await callRouter(
        [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        chosenModel
      );

      const finalContent = content
        ? cleanMarkdownDocument(content)
        : demoDocument(name, payload);

      return reply({
        mode: content ? "ai" : "demo",
        name,
        content: finalContent,
      });
    }

    return reply({ error: "Aksi tidak dikenali." }, 400);
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : "Kesalahan tidak diketahui." },
      502
    );
  }
}
