"use client";

import {
  AlertCircle, ArrowRight, BrainCircuit, Check, ChevronDown, ChevronRight, Circle,
  Clock, Code, Copy, Cpu, Download, Eye, FileCode2, FileText, FolderOpen, Loader2, Maximize2,
  Menu, Minimize2, Moon, Plus, RefreshCw, Save, Search, Sparkles, Sun, X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelsResponse, RouterModelItem } from "../lib/nine-router";

type Answer = { question: string; answer: string };
type Question = {
  id: string;
  label: string;
  question: string;
  why?: string;
  options?: string[];
  selectionMode: "single" | "multiple";
};
type DraftAnswer = { selected: string[]; custom: string };
type DocumentItem = { name: string; content: string; mode?: string };
type DocumentName =
  | "PRD.md"
  | "architecture.md"
  | "database.md"
  | "api.md"
  | "design.md"
  | "implementation-plan.md"
  | "decisions.md";
type DocumentRecommendation = {
  name: DocumentName;
  included: boolean;
  required: boolean;
  reason: string;
};
type InterviewResponse = {
  mode: "ai" | "demo";
  ready: boolean;
  summary: string;
  questions: Question[];
  recommendedDocuments?: DocumentRecommendation[];
};
type Project = {
  id: string; title: string; idea: string; status: string;
  spec: {
    answers: Answer[];
    summary: string;
    customInstructions: string;
    documentRecommendations?: DocumentRecommendation[];
    selectedDocuments?: DocumentName[];
  };
  documents: DocumentItem[]; updatedAt?: string;
};

const DOC_OPTIONS = [
  ["PRD.md", "Tujuan, fitur, ruang lingkup, dan acceptance criteria"],
  ["architecture.md", "Komponen, aliran data, dan keputusan teknis"],
  ["database.md", "Entitas, relasi, constraint, dan ERD bila dibutuhkan"],
  ["api.md", "Kontrak API internal maupun integrasi eksternal"],
  ["design.md", "Halaman, alur pengguna, UI states, dan aksesibilitas"],
  ["implementation-plan.md", "Fase, dependency, dan checklist pengerjaan"],
  ["decisions.md", "Keputusan, asumsi, dan pertanyaan terbuka"],
] as const satisfies readonly (readonly [DocumentName, string])[];
const DEFAULT_SELECTED: DocumentName[] = ["PRD.md", "architecture.md", "design.md", "implementation-plan.md", "decisions.md"];
const REQUIRED_DOCUMENTS = new Set<DocumentName>(["PRD.md", "design.md", "decisions.md"]);
const STORAGE_KEY = "naskah-ai-projects-v1";
const MODEL_STORAGE_KEY = "naskah-ai-selected-model";

function defaultDocumentRecommendations(): DocumentRecommendation[] {
  return DOC_OPTIONS.map(([name, description]) => ({
    name,
    included: DEFAULT_SELECTED.includes(name),
    required: REQUIRED_DOCUMENTS.has(name),
    reason: REQUIRED_DOCUMENTS.has(name)
      ? `${description}. Dokumen ini wajib untuk setiap proyek.`
      : DEFAULT_SELECTED.includes(name)
      ? `${description}. Direkomendasikan sebagai paket perencanaan dasar.`
      : `${description}. Belum direkomendasikan dari informasi yang tersedia.`,
  }));
}

function normalizeDocumentRecommendations(
  value?: DocumentRecommendation[]
): DocumentRecommendation[] {
  if (!Array.isArray(value) || !value.length) {
    return defaultDocumentRecommendations();
  }

  const byName = new Map(value.map((item) => [item.name, item]));
  return DOC_OPTIONS.map(([name, description]) => {
    const item = byName.get(name);
    const required = REQUIRED_DOCUMENTS.has(name);
    return {
      name,
      included: required || item?.included === true,
      required,
      reason:
        item?.reason?.trim() ||
        (required
          ? `${description}. Dokumen ini wajib untuk setiap proyek.`
          : `${description}.`),
    };
  });
}

function normalizeSelectedDocuments(
  selected: DocumentName[] | undefined,
  recommendations: DocumentRecommendation[]
): DocumentName[] {
  const allowed = new Set<DocumentName>(DOC_OPTIONS.map(([name]) => name));
  const requested = Array.isArray(selected)
    ? selected.filter((name): name is DocumentName => allowed.has(name))
    : recommendations.filter((item) => item.included).map((item) => item.name);
  const selectedSet = new Set<DocumentName>([
    ...requested,
    ...REQUIRED_DOCUMENTS,
  ]);
  return DOC_OPTIONS.map(([name]) => name).filter((name) => selectedSet.has(name));
}

function freshProject(): Project {
  const documentRecommendations = defaultDocumentRecommendations();
  return { id: crypto.randomUUID(), title: "Proyek baru", idea: "", status: "draft", spec: { answers: [], summary: "", customInstructions: "", documentRecommendations, selectedDocuments: [...DEFAULT_SELECTED] }, documents: [], updatedAt: new Date().toISOString() };
}

function normalizeProject(source: Project): Project {
  const documentRecommendations = normalizeDocumentRecommendations(
    source.spec.documentRecommendations
  );
  const selectedDocuments = normalizeSelectedDocuments(
    source.spec.selectedDocuments,
    documentRecommendations
  );
  return {
    ...source,
    spec: {
      ...source.spec,
      documentRecommendations,
      selectedDocuments,
    },
  };
}

function inlineText(value: string) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

interface MermaidGlobal {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
}

let mermaidInitPromise: Promise<MermaidGlobal | null> | null = null;

async function loadMermaidLibrary(): Promise<MermaidGlobal | null> {
  if (typeof window === "undefined") return null;
  const win = window as unknown as { mermaid?: MermaidGlobal };
  if (win.mermaid) return win.mermaid;
  if (mermaidInitPromise) return mermaidInitPromise;

  mermaidInitPromise = new Promise((resolve) => {
    const initMermaid = (instance: MermaidGlobal) => {
      try {
        instance.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          flowchart: {
            curve: "basis",
            htmlLabels: true,
            useMaxWidth: true,
          },
          themeVariables: {
            darkMode: false,
            background: "#fcfbf7",
            primaryColor: "#ffffff",
            primaryTextColor: "#18231f",
            primaryBorderColor: "#1f5a45",
            lineColor: "#1f5a45",
            secondaryColor: "#f4f7f4",
            tertiaryColor: "#ebf3ed",
            nodeBorder: "#1f5a45",
            clusterBkg: "#f7faf8",
            clusterBorder: "#cad8ce",
            titleColor: "#18231f",
            edgeLabelBackground: "#fcfbf7",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: "13px",
          },
        });
      } catch {
        // Abaikan jika sudah diinisialisasi
      }
      win.mermaid = instance;
      resolve(instance);
    };

    const script = document.createElement("script");
    script.src = "/mermaid.min.js";
    script.async = true;
    script.onload = () => {
      if (win.mermaid) initMermaid(win.mermaid);
      else resolve(null);
    };
    script.onerror = () => {
      const cdnScript = document.createElement("script");
      cdnScript.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      cdnScript.async = true;
      cdnScript.onload = () => {
        if (win.mermaid) initMermaid(win.mermaid);
        else resolve(null);
      };
      cdnScript.onerror = () => resolve(null);
      document.head.appendChild(cdnScript);
    };
    document.head.appendChild(script);
  });

  return mermaidInitPromise;
}

function getMermaidThemeDirective(mode: "light" | "dark"): string {
  if (mode === "dark") {
    return `%%{init: {
  "theme": "base",
  "themeVariables": {
    "darkMode": true,
    "background": "#14201c",
    "primaryColor": "#1e3028",
    "primaryTextColor": "#e8f1ec",
    "primaryBorderColor": "#365947",
    "lineColor": "#529778",
    "secondaryColor": "#243930",
    "tertiaryColor": "#182620",
    "nodeBorder": "#365947",
    "clusterBkg": "#182721",
    "clusterBorder": "#2e4a3c",
    "titleColor": "#e8f1ec",
    "edgeLabelBackground": "#14201c",
    "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
    "fontSize": "13px"
  }
}}%%`;
  }
  return `%%{init: {
  "theme": "base",
  "themeVariables": {
    "darkMode": false,
    "background": "#fcfbf7",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#18231f",
    "primaryBorderColor": "#1f5a45",
    "lineColor": "#1f5a45",
    "secondaryColor": "#f4f7f4",
    "tertiaryColor": "#ebf3ed",
    "nodeBorder": "#1f5a45",
    "clusterBkg": "#f7faf8",
    "clusterBorder": "#cad8ce",
    "titleColor": "#18231f",
    "edgeLabelBackground": "#fcfbf7",
    "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
    "fontSize": "13px"
  }
}}%%`;
}

function sanitizeClientMermaid(raw: string, mode: "light" | "dark" = "light"): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\r?\n/i, "").replace(/\r?\n```\s*$/i, "").trim();

  // Hapus directive lama jika ada agar theme kita yang berlaku
  cleaned = cleaned.replace(/^%%\{[\s\S]*?\}%%\s*\r?\n/i, "").trim();

  if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph)\b/i.test(cleaned)) {
    cleaned = `flowchart TD\n${cleaned}`;
  }

  cleaned = cleaned.replace(
    /([a-zA-Z0-9_-]+)\[([^"\]\r\n][^\]\r\n]*?)\]/g,
    (_m, id, label) => {
      const safe = label.trim().replace(/"/g, "'");
      return `${id}["${safe}"]`;
    }
  );

  return `${getMermaidThemeDirective(mode)}\n${cleaned}`;
}

function MermaidViewer({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"visual" | "code">("visual");
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const containerId = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let active = true;
    async function renderMermaid() {
      setLoading(true);
      setError("");
      try {
        const m = await loadMermaidLibrary();
        if (!m || !active) {
          if (active) setLoading(false);
          return;
        }
        const renderId = `${containerId.current}-${themeMode}-${Date.now().toString(36)}`;
        const sanitized = sanitizeClientMermaid(code, themeMode);
        const { svg: rendered } = await m.render(renderId, sanitized);
        if (active) {
          setSvg(rendered);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Diagram tidak dapat di-render.");
          setLoading(false);
          setViewMode("code");
        }
      }
    }
    renderMermaid();
    return () => {
      active = false;
    };
  }, [code, themeMode]);

  return (
    <div className={`mermaid-card mermaid-theme-${themeMode} ${fullscreen ? "mermaid-fullscreen" : ""}`}>
      <div className="mermaid-toolbar">
        <div className="mermaid-title">
          <BrainCircuit size={14} />
          <span>Diagram Alur Sistem</span>
        </div>
        <div className="mermaid-actions">
          <button
            type="button"
            className="mermaid-theme-btn"
            onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
            title={themeMode === "light" ? "Ganti ke Tema Studio (Gelap)" : "Ganti ke Tema Kertas (Terang)"}
          >
            {themeMode === "light" ? (
              <>
                <Moon size={12} /> Studio
              </>
            ) : (
              <>
                <Sun size={12} /> Kertas
              </>
            )}
          </button>
          <button
            type="button"
            className={`mermaid-toggle-btn ${viewMode === "visual" ? "active" : ""}`}
            onClick={() => setViewMode("visual")}
            title="Lihat Visual Diagram"
          >
            <Eye size={13} /> Visual
          </button>
          <button
            type="button"
            className={`mermaid-toggle-btn ${viewMode === "code" ? "active" : ""}`}
            onClick={() => setViewMode("code")}
            title="Lihat Kode Mermaid"
          >
            <Code size={13} /> Kode
          </button>
          <button
            type="button"
            className="mermaid-icon-btn"
            onClick={() => setFullscreen((prev) => !prev)}
            title={fullscreen ? "Tutup Fullscreen" : "Perbesar Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>
      {viewMode === "visual" ? (
        <div className="mermaid-canvas">
          {loading && (
            <div className="mermaid-loading">
              <Loader2 size={16} className="spin" />
              <span>Menyusun diagram...</span>
            </div>
          )}
          {error ? (
            <div className="mermaid-fallback-box">
              <p>Sintaks diagram belum dapat ditampilkan secara visual. Menampilkan kode sumber:</p>
              <pre>{code}</pre>
            </div>
          ) : (
            svg && (
              <div
                className="mermaid-svg-wrapper"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )
          )}
        </div>
      ) : (
        <pre className="mermaid-code-view">{code}</pre>
      )}
    </div>
  );
}

type MarkdownBlock =
  | { type: `h${number}`; text: string }
  | { type: "li"; text: string }
  | { type: "check"; text: string; language?: string }
  | { type: "quote"; text: string }
  | { type: "hr"; text: string }
  | { type: "code"; text: string; language?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "p"; text: string };

function parseTableBlock(lines: string[]): { headers: string[]; rows: string[][] } | null {
  if (lines.length < 2) return null;
  const splitCells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = splitCells(lines[0]);
  const separator = splitCells(lines[1]);
  const isValidSeparator = separator.length > 0 && separator.every((col) => /^:?-+:?$/.test(col));
  if (!isValidSeparator || headers.length === 0) return null;

  const rows: string[][] = [];
  for (let idx = 2; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line || !line.includes("|")) break;
    const cells = splitCells(line);
    while (cells.length < headers.length) cells.push("");
    rows.push(cells.slice(0, headers.length));
  }
  return { headers, rows };
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => {
    let cleanContent = content.trim();
    const outerFence = cleanContent.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    if (outerFence) {
      cleanContent = outerFence[1].trim();
    }

    const result: MarkdownBlock[] = [];
    const lines = cleanContent.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith("```")) {
        const language = line.slice(3).trim();
        const codeBuffer: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeBuffer.push(lines[i]);
          i++;
        }
        i++; // lewati penutup ```
        result.push({ type: "code", text: codeBuffer.join("\n"), language });
        continue;
      }

      // Tables
      if (
        line.trim().startsWith("|") &&
        i + 1 < lines.length &&
        lines[i + 1].trim().startsWith("|") &&
        /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim())
      ) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().includes("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        const parsed = parseTableBlock(tableLines);
        if (parsed) {
          result.push({ type: "table", headers: parsed.headers, rows: parsed.rows });
          continue;
        }
      }

      // Headings
      if (/^#{1,6} /.test(line)) {
        const level = line.match(/^#+/)?.[0].length ?? 2;
        result.push({ type: `h${level}`, text: line.slice(level + 1) });
        i++;
        continue;
      }

      // Checkbox
      if (/^- \[[ xX]\] /.test(line)) {
        result.push({ type: "check", text: line.slice(6), language: line[3] });
        i++;
        continue;
      }

      // Bullet list
      if (line.startsWith("- ")) {
        result.push({ type: "li", text: line.slice(2) });
        i++;
        continue;
      }

      // Numbered list
      if (/^\d+\. /.test(line)) {
        result.push({ type: "li", text: line.replace(/^\d+\. /, "") });
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        result.push({ type: "quote", text: line.slice(2) });
        i++;
        continue;
      }

      // HR
      if (/^---+$/.test(line)) {
        result.push({ type: "hr", text: "" });
        i++;
        continue;
      }

      // Paragraph
      if (line.trim()) {
        result.push({ type: "p", text: line });
      }
      i++;
    }

    return result;
  }, [content]);

  return (
    <article className="markdown-preview">
      {blocks.map((block, index) => {
        if (block.type === "h1") return <h1 key={index}>{inlineText(block.text)}</h1>;
        if (block.type === "h2") return <h2 key={index}>{inlineText(block.text)}</h2>;
        if (block.type === "li") return <div className="preview-list" key={index}><span>•</span><p>{inlineText(block.text)}</p></div>;
        if (block.type === "check") return <div className="preview-list" key={index}><span className="check-box">{block.language?.toLowerCase() === "x" ? "✓" : ""}</span><p>{inlineText(block.text)}</p></div>;
        if (block.type === "quote") return <blockquote key={index}>{inlineText(block.text)}</blockquote>;
        if (block.type === "hr") return <hr key={index} />;
        if (block.type === "table") {
          return (
            <div className="preview-table-wrap" key={index}>
              <table className="preview-table">
                <thead>
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx}>{inlineText(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{inlineText(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "code") {
          if (block.language === "mermaid") {
            return <MermaidViewer code={block.text} key={index} />;
          }
          return (
            <div className="code-block" key={index}>
              <div className="code-title">
                <span>{block.language || "code"}</span>
              </div>
              <pre>{block.text}</pre>
            </div>
          );
        }
        if (block.type === "p") {
          return <p key={index}>{inlineText(block.text)}</p>;
        }
        return <h3 key={index}>{inlineText(block.text)}</h3>;
      })}
    </article>
  );
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${String(h).padStart(2, "0")}:${String(remM).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>(() => freshProject());
  const [phase, setPhase] = useState<"idea" | "interview" | "review" | "documents">("idea");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [selectedDocs, setSelectedDocs] = useState<DocumentName[]>(DEFAULT_SELECTED);
  const [documentRecommendations, setDocumentRecommendations] = useState<DocumentRecommendation[]>(() => defaultDocumentRecommendations());
  const [activeDoc, setActiveDoc] = useState("PRD.md");
  const [view, setView] = useState<"preview" | "source">("preview");
  const [busy, setBusy] = useState("");
  const [busyElapsed, setBusyElapsed] = useState(0);
  const [copiedDoc, setCopiedDoc] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [aiMode, setAiMode] = useState<"unknown" | "ai" | "demo">("unknown");
  const [mobileNav, setMobileNav] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!busy) {
      setBusyElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setBusyElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [Boolean(busy)]);

  // Model selector states
  const [models, setModels] = useState<RouterModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [loadingModels, setLoadingModels] = useState<boolean>(true);
  const [modelsError, setModelsError] = useState<string>("");
  const [modelSearch, setModelSearch] = useState<string>("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState<boolean>(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setModelsError("");
    try {
      const data = await api<ModelsResponse>("/api/models");
      const list = data.models || [];
      setModels(list);
      setDefaultModel(data.defaultModel || "");

      // Urutan penentuan model awal:
      // 1. Model terakhir dari localStorage, jika masih tersedia.
      // 2. NINE_ROUTER_MODEL, jika tersedia.
      // 3. Model pertama dari respons.
      // 4. String kosong jika tidak ada model sama sekali.
      const cached = typeof window !== "undefined" ? localStorage.getItem(MODEL_STORAGE_KEY) : null;
      let chosen = "";

      if (cached && list.some((m) => m.id === cached)) {
        chosen = cached;
      } else if (data.defaultModel && list.some((m) => m.id === data.defaultModel)) {
        chosen = data.defaultModel;
      } else if (list.length > 0) {
        chosen = list[0].id;
      } else if (data.defaultModel) {
        chosen = data.defaultModel;
      } else {
        chosen = "";
      }

      setSelectedModel(chosen);
      if (chosen && typeof window !== "undefined") {
        localStorage.setItem(MODEL_STORAGE_KEY, chosen);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tidak dapat mengambil daftar model dari 9Router.";
      setModelsError(msg);
      const cached = typeof window !== "undefined" ? localStorage.getItem(MODEL_STORAGE_KEY) : null;
      if (cached) {
        setSelectedModel(cached);
      }
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModelDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [modelDropdownOpen]);

  function handleSelectModel(id: string) {
    setSelectedModel(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    }
    setModelDropdownOpen(false);
  }

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return models;
    const q = modelSearch.toLowerCase().trim();
    return models.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.ownedBy.toLowerCase().includes(q)
    );
  }, [models, modelSearch]);

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) try {
      const parsed = JSON.parse(local) as Project[];
      if (parsed.length) {
        const normalized = parsed.map(normalizeProject);
        const first = normalized[0];
        setProjects(normalized);
        setProject(first);
        setDocumentRecommendations(first.spec.documentRecommendations ?? defaultDocumentRecommendations());
        setSelectedDocs(first.spec.selectedDocuments ?? DEFAULT_SELECTED);
        if (first.status === "partial") setPhase("review");
        else if (first.documents.length) setPhase("documents");
      }
    } catch { /* ignore invalid local cache */ }
    api<{ projects: Project[] }>("/api/projects").then((data) => {
      if (data.projects.length) {
        const normalized = data.projects.map(normalizeProject);
        const first = normalized[0];
        setProjects(normalized);
        setProject(first);
        setDocumentRecommendations(first.spec.documentRecommendations ?? defaultDocumentRecommendations());
        setSelectedDocs(first.spec.selectedDocuments ?? DEFAULT_SELECTED);
        if (first.status === "partial") setPhase("review");
        else if (first.documents.length) setPhase("documents");
      }
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = [project, ...projects.filter((item) => item.id !== project.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [project, projects, hydrated]);

  const currentDocument = project.documents.find((item) => item.name === activeDoc);
  const updateProject = (patch: Partial<Project>) => setProject((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  const updateSpec = (patch: Partial<Project["spec"]>) => setProject((current) => ({ ...current, spec: { ...current.spec, ...patch }, updatedAt: new Date().toISOString() }));

  function newProject() {
    const next = freshProject();
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setProject(next); setDocumentRecommendations(next.spec.documentRecommendations ?? defaultDocumentRecommendations()); setSelectedDocs(next.spec.selectedDocuments ?? DEFAULT_SELECTED); setPhase("idea"); setQuestions([]); setDraftAnswers({}); setActiveDoc("PRD.md"); setNotice(""); setMobileNav(false);
  }

  function openProject(item: Project) {
    const normalized = normalizeProject(item);
    setProjects((current) => [project, ...current.filter((entry) => entry.id !== project.id && entry.id !== item.id)]);
    setProject(normalized);
    setDocumentRecommendations(normalized.spec.documentRecommendations ?? defaultDocumentRecommendations());
    setSelectedDocs(normalized.spec.selectedDocuments ?? DEFAULT_SELECTED);
    setPhase(normalized.status === "partial" ? "review" : normalized.documents.length ? "documents" : normalized.spec.summary ? "review" : normalized.spec.answers.length ? "interview" : "idea");
    setActiveDoc(normalized.documents[0]?.name ?? "PRD.md"); setMobileNav(false); setNotice("");
  }

  function applyDocumentRecommendations(value?: DocumentRecommendation[]) {
    const recommendations = normalizeDocumentRecommendations(value);
    const selected = normalizeSelectedDocuments(undefined, recommendations);
    setDocumentRecommendations(recommendations);
    setSelectedDocs(selected);
    updateSpec({
      documentRecommendations: recommendations,
      selectedDocuments: selected,
    });
  }

  function toggleDocument(name: DocumentName) {
    if (REQUIRED_DOCUMENTS.has(name)) return;
    const next = selectedDocs.includes(name)
      ? selectedDocs.filter((item) => item !== name)
      : DOC_OPTIONS.map(([optionName]) => optionName).filter(
          (optionName) =>
            optionName === name || selectedDocs.includes(optionName)
        );
    setSelectedDocs(next);
    updateSpec({ selectedDocuments: next });
  }

  function toggleQuestionOption(question: Question, option: string) {
    setDraftAnswers((current) => {
      const draft = current[question.id] ?? { selected: [], custom: "" };
      if (question.selectionMode === "single") {
        return {
          ...current,
          [question.id]: { selected: [option], custom: "" },
        };
      }

      const selected = draft.selected.includes(option)
        ? draft.selected.filter((item) => item !== option)
        : [...draft.selected, option];
      return { ...current, [question.id]: { ...draft, selected } };
    });
  }

  function updateCustomAnswer(question: Question, custom: string) {
    setDraftAnswers((current) => {
      const draft = current[question.id] ?? { selected: [], custom: "" };
      return {
        ...current,
        [question.id]: {
          selected:
            question.selectionMode === "single" && custom.trim()
              ? []
              : draft.selected,
          custom,
        },
      };
    });
  }

  function formatDraftAnswer(question: Question) {
    const draft = draftAnswers[question.id];
    if (!draft) return "Belum diputuskan";

    const custom = draft.custom.trim();
    if (!draft.selected.length) return custom || "Belum diputuskan";
    if (!custom) return draft.selected.join(", ");
    return `${draft.selected.join(", ")}; Tambahan: ${custom}`;
  }

  async function analyzeIdea() {
    if (project.idea.trim().length < 12) return setNotice("Ceritakan idenya sedikit lebih lengkap, minimal 12 karakter.");
    setBusy("Menganalisis ide dan menyusun pertanyaan penting..."); setNotice("");
    try {
      const data = await api<InterviewResponse>("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "interview",
          model: selectedModel,
          idea: project.idea,
          answers: project.spec.answers,
          customInstructions: project.spec.customInstructions,
        }),
      });
      setAiMode(data.mode); updateSpec({ summary: data.summary }); setQuestions(data.questions || []); setDraftAnswers({});
      if (data.ready) applyDocumentRecommendations(data.recommendedDocuments);
      setPhase(data.ready ? "review" : "interview");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Analisis gagal."); } finally { setBusy(""); }
  }

  async function submitAnswers() {
    const completed = questions.map((question) => ({
      question: question.question,
      answer: formatDraftAnswer(question),
    }));
    const answers = [...project.spec.answers, ...completed]; updateSpec({ answers }); setBusy("Menilai jawaban dan menentukan kebutuhan berikutnya..."); setNotice("");
    try {
      const data = await api<InterviewResponse>("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "interview",
          model: selectedModel,
          idea: project.idea,
          answers,
          customInstructions: project.spec.customInstructions,
        }),
      });
      setAiMode(data.mode); updateSpec({ answers, summary: data.summary }); setQuestions(data.questions || []); setDraftAnswers({});
      if (data.ready) applyDocumentRecommendations(data.recommendedDocuments);
      setPhase(data.ready ? "review" : "interview");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Analisis jawaban gagal."); } finally { setBusy(""); }
  }

  async function generateDocuments() {
    if (!selectedDocs.length) return setNotice("Pilih minimal satu dokumen.");
    setNotice("");
    const existingDocuments =
      project.status === "partial"
        ? new Map(project.documents.map((item) => [item.name, item]))
        : new Map<string, DocumentItem>();
    const generated: DocumentItem[] = selectedDocs.flatMap((name) => {
      const existing = existingDocuments.get(name);
      return existing ? [existing] : [];
    });
    const pendingDocuments = selectedDocs.filter(
      (name) => !existingDocuments.has(name)
    );
    let activeName: DocumentName | null = null;

    try {
      for (const name of pendingDocuments) {
        activeName = name;
        const documentNumber = selectedDocs.indexOf(name) + 1;
        setBusy(`Menyusun ${name} (${documentNumber}/${selectedDocs.length})...`);
        const priorDocuments = Object.fromEntries(generated.map((item) => [item.name, item.content]));
        const data = await api<{ mode: "ai" | "demo"; name: string; content: string }>("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            model: selectedModel,
            idea: project.idea,
            answers: project.spec.answers,
            summary: project.spec.summary,
            customInstructions: project.spec.customInstructions,
            documentName: name,
            priorDocuments,
          }),
        });
        setAiMode(data.mode);
        generated.push({ name: data.name, content: data.content, mode: data.mode });
        generated.sort(
          (a, b) =>
            selectedDocs.indexOf(a.name as DocumentName) -
            selectedDocs.indexOf(b.name as DocumentName)
        );
        updateProject({ documents: [...generated], status: "partial" });
      }
      const finished = {
        ...project,
        spec: {
          ...project.spec,
          documentRecommendations,
          selectedDocuments: selectedDocs,
        },
        documents: generated,
        status: "ready",
      };
      updateProject({ documents: generated, status: "ready" }); setActiveDoc(generated[0]?.name ?? "PRD.md"); setPhase("documents"); await saveProject(finished, false);
    } catch (error) {
      const partialProject = {
        ...project,
        spec: {
          ...project.spec,
          documentRecommendations,
          selectedDocuments: selectedDocs,
        },
        documents: [...generated],
        status: "partial",
      };
      setProject(partialProject);
      setProjects((current) => [
        partialProject,
        ...current.filter((item) => item.id !== partialProject.id),
      ]);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          partialProject,
          ...projects.filter((item) => item.id !== partialProject.id),
        ])
      );
      await saveProject(partialProject, false);
      const message =
        error instanceof Error ? error.message : "Pembuatan dokumen gagal.";
      if (generated.length > 0) {
        setActiveDoc(generated[0]?.name ?? "PRD.md");
      }
      setNotice(
        `${generated.length}/${selectedDocs.length} dokumen berhasil disimpan. Gagal saat menyusun ${activeName ?? "dokumen berikutnya"}: ${message}`
      );
    } finally { setBusy(""); }
  }

  async function regenerateSingleDocument(docName: string) {
    if (!docName) return;
    setBusy(`Menyusun ulang ${docName}...`);
    setNotice("");
    try {
      const priorDocuments = Object.fromEntries(
        project.documents
          .filter((item) => item.name !== docName)
          .map((item) => [item.name, item.content])
      );
      const data = await api<{ mode: "ai" | "demo"; name: string; content: string }>("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          model: selectedModel,
          idea: project.idea,
          answers: project.spec.answers,
          summary: project.spec.summary,
          customInstructions: project.spec.customInstructions,
          documentName: docName,
          priorDocuments,
        }),
      });
      setAiMode(data.mode);
      const updatedDocs = project.documents.some((d) => d.name === docName)
        ? project.documents.map((d) => (d.name === docName ? { ...d, content: data.content, mode: data.mode } : d))
        : [...project.documents, { name: data.name, content: data.content, mode: data.mode }];

      const updated = {
        ...project,
        documents: updatedDocs,
      };
      setProject(updated);
      await saveProject(updated, false);
      setNotice(`${docName} berhasil dibuat ulang.`);
    } catch (error) {
      setNotice(
        `Gagal membuat ulang ${docName}: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui."}`
      );
    } finally {
      setBusy("");
    }
  }

  async function saveProject(source = project, showNotice = true) {
    const derivedTitle = source.title === "Proyek baru" && source.idea ? source.idea.split(/[.!?\n]/)[0].slice(0, 58) : source.title;
    const updated = { ...source, title: derivedTitle || "Proyek tanpa judul", updatedAt: new Date().toISOString() };
    setProject(updated); setProjects((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([updated, ...projects.filter((item) => item.id !== updated.id)]));
    try {
      const result = await api<{ id: string }>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "save", project: updated }) });
      if (result.id !== updated.id) setProject((current) => ({ ...current, id: result.id }));
      if (showNotice) setNotice("Proyek tersimpan dan siap dibuka lagi.");
    } catch { if (showNotice) setNotice("Tersimpan di perangkat ini. Sinkronisasi server belum tersedia."); }
  }

  const updateDocument = (content: string) => updateProject({ documents: project.documents.map((item) => item.name === activeDoc ? { ...item, content } : item) });
  function downloadDocument(doc: DocumentItem) {
    const url = URL.createObjectURL(new Blob([doc.content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = doc.name; anchor.click(); URL.revokeObjectURL(url);
  }
  async function copyDocument(doc: DocumentItem) {
    if (!doc?.content) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(doc.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = doc.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedDoc(doc.name);
      setTimeout(() => {
        setCopiedDoc((curr) => (curr === doc.name ? null : curr));
      }, 2000);
    } catch {
      setNotice("Gagal menyalin teks ke clipboard.");
    }
  }
  const completedSelectedDocuments = selectedDocs.filter((name) =>
    project.documents.some((document) => document.name === name)
  ).length;
  const remainingDocuments = selectedDocs.length - completedSelectedDocuments;
  const canResumeGeneration =
    project.status === "partial" &&
    completedSelectedDocuments > 0 &&
    remainingDocuments > 0;
  const progress = phase === "idea" ? 1 : phase === "interview" ? 2 : phase === "review" ? 3 : 4;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><FileText size={18} /></span><span><strong>Naskah</strong><em>AI planner</em></span><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
      <button className="new-project" onClick={newProject}><Plus size={17} /> Proyek baru</button>
      <div className="side-label">Proyek terakhir</div>
      <nav className="project-list">{[project, ...projects.filter((item) => item.id !== project.id)].map((item) => <button key={item.id} className={item.id === project.id ? "project-active" : ""} onClick={() => openProject(item)}><span className="project-icon"><FolderOpen size={16} /></span><span><strong>{item.title}</strong><em>{item.documents.length ? `${item.documents.length} dokumen` : "Masih dirancang"}</em></span><ChevronRight size={15} /></button>)}</nav>
      <div className="sidebar-note"><BrainCircuit size={18} /><div><strong>Planner only</strong><p>Membuat dokumen dan diagram. Tidak menjalankan coding.</p></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
        <div>
          <span className="eyebrow">Project studio</span>
          <input aria-label="Nama proyek" value={project.title} onChange={(event) => updateProject({ title: event.target.value })} />
        </div>
        <div className="top-actions">
          {/* Model Selector 9Router */}
          <div className="model-selector-wrap" ref={modelDropdownRef}>
            <button
              type="button"
              className={`model-trigger ${loadingModels ? "loading" : ""} ${modelsError && !selectedModel ? "has-error" : ""}`}
              onClick={() => setModelDropdownOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={modelDropdownOpen}
              title={selectedModel ? `Model AI: ${selectedModel}` : "Pilih model AI"}
            >
              {loadingModels ? (
                <Loader2 size={13} className="spin model-trigger-icon" />
              ) : modelsError && !selectedModel ? (
                <AlertCircle size={13} className="model-trigger-icon" />
              ) : (
                <Cpu size={13} className="model-trigger-icon" />
              )}
              <span className="model-trigger-text">
                {loadingModels && !selectedModel ? "Memuat model..." : selectedModel || "Pilih model"}
              </span>
              <ChevronDown size={13} className={`model-trigger-chevron ${modelDropdownOpen ? "open" : ""}`} />
            </button>

            {modelDropdownOpen && (
              <div className="model-dropdown">
                <div className="model-dropdown-header">
                  <div className="model-dropdown-title">
                    <Cpu size={13} />
                    <span>Model 9Router</span>
                    {models.length > 0 && <span className="model-count-badge">({models.length} model)</span>}
                  </div>
                  <button
                    type="button"
                    className="model-refresh-btn"
                    onClick={() => loadModels()}
                    disabled={loadingModels}
                    title="Refresh daftar model dari 9Router"
                  >
                    <RefreshCw size={11} className={loadingModels ? "spin" : ""} /> Refresh
                  </button>
                </div>

                {modelsError && (
                  <div className="model-error-box">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertCircle size={14} />
                      <span>{modelsError}</span>
                    </div>
                    <button
                      type="button"
                      className="model-retry-btn"
                      onClick={() => loadModels()}
                      disabled={loadingModels}
                    >
                      <RefreshCw size={11} className={loadingModels ? "spin" : ""} /> Coba lagi
                    </button>
                    {defaultModel && !selectedModel && (
                      <button
                        type="button"
                        className="model-retry-btn"
                        onClick={() => handleSelectModel(defaultModel)}
                      >
                        Gunakan model default: {defaultModel}
                      </button>
                    )}
                  </div>
                )}

                {models.length > 0 && (
                  <div className="model-search-wrap">
                    <Search size={13} className="model-search-icon" />
                    <input
                      className="model-search-input"
                      placeholder="Cari model..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      autoFocus
                    />
                    {modelSearch && (
                      <button
                        type="button"
                        className="model-search-clear"
                        onClick={() => setModelSearch("")}
                        title="Hapus pencarian"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}

                <div className="model-list">
                  {loadingModels && models.length === 0 ? (
                    <div className="model-loading">
                      <Loader2 size={16} className="spin" />
                      <span>Memuat model...</span>
                    </div>
                  ) : !modelsError && models.length === 0 ? (
                    <div className="model-empty">Tidak ada model yang dikembalikan 9Router.</div>
                  ) : filteredModels.length === 0 ? (
                    <div className="model-empty">
                      Tidak ada model yang cocok dengan &quot;{modelSearch}&quot;.
                    </div>
                  ) : (
                    filteredModels.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`model-option ${selectedModel === item.id ? "active" : ""}`}
                        onClick={() => handleSelectModel(item.id)}
                      >
                        <span className="model-option-left">
                          <span className="model-option-pill">{item.ownedBy || "9r"}</span>
                          <span className="model-option-id">{item.id}</span>
                        </span>
                        {selectedModel === item.id && (
                          <Check size={13} className="model-option-check" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <span className={`mode-pill mode-${aiMode}`}>
            {aiMode === "ai" ? <Sparkles size={14} /> : <Circle size={11} />}
            {aiMode === "ai" ? "9Router aktif" : aiMode === "demo" ? "Mode demo" : "AI belum dites"}
          </span>
          <button className="ghost-button" onClick={() => saveProject()}><Save size={16} /> Simpan</button>
        </div>
      </header>
      <div className="progress-wrap">{["Ide", "Wawancara", "Konfirmasi", "Dokumen"].map((label, index) => <div key={label} className={progress >= index + 1 ? "progress-step active" : "progress-step"}><span>{progress > index + 1 ? <Check size={13} /> : index + 1}</span><em>{label}</em></div>)}</div>

      <div className="content-area">
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}><X size={16} /></button></div>}
        {busy && (
          <div className="busy">
            <Loader2 size={18} className="spin" />
            <div className="busy-body">
              <div className="busy-title-row">
                <strong>{busy}</strong>
                <span className="busy-timer">
                  <Clock size={12} /> Bekerja ({formatDuration(busyElapsed)})
                </span>
              </div>
              <span>Memproses tanpa batas timeout. Biarkan proses selesai secara alami.</span>
            </div>
          </div>
        )}

        {phase === "idea" && <section className="stage idea-stage"><div className="stage-kicker"><Sparkles size={16} /> Mulai dari ide mentah</div><h1>Proyek yang bagus dimulai dari pertanyaan yang tepat.</h1><p>Ceritakan apa yang ingin lu buat. AI akan mencari bagian yang masih ambigu sebelum menulis dokumen.</p><div className="idea-box"><textarea autoFocus placeholder="Contoh: Gue mau bikin aplikasi Flutter yang menampilkan kondisi langit pada tanggal kelahiran pengguna menggunakan API astronomi..." value={project.idea} onChange={(event) => updateProject({ idea: event.target.value })} /><div className="idea-footer"><span>{project.idea.length.toLocaleString("id-ID")} karakter</span><button onClick={analyzeIdea} disabled={!!busy}>Analisis ide <ArrowRight size={17} /></button></div></div><div className="instruction-box"><label>Instruksi khusus <span>opsional</span></label><textarea placeholder="Contoh: gunakan bahasa mahasiswa semester 3, wajib Flutter, jangan tambahkan login..." value={project.spec.customInstructions} onChange={(event) => updateSpec({ customInstructions: event.target.value })} /></div><div className="feature-row"><div><span>01</span><strong>Wawancara adaptif</strong><p>Pertanyaan mengikuti ide dan jawaban sebelumnya.</p></div><div><span>02</span><strong>Konsisten</strong><p>Fitur, data, API, desain, dan rencana saling terhubung.</p></div><div><span>03</span><strong>Siap diekspor</strong><p>Unduh file Markdown tanpa format tambahan.</p></div></div></section>}

        {phase === "interview" && <section className="stage interview-stage"><div className="stage-header"><div><span className="stage-kicker"><BrainCircuit size={16} /> Wawancara kebutuhan</span><h1>Beberapa keputusan masih perlu diperjelas.</h1><p>Jawab singkat saja. Pilihan yang tersedia bukan batasan, lu tetap bisa menulis jawaban sendiri.</p></div><span className="question-count">{questions.length} pertanyaan</span></div><div className="question-stack">{questions.map((question, index) => { const draft = draftAnswers[question.id] ?? { selected: [], custom: "" }; return <div className="question-card" key={question.id}><div className="question-number">0{index + 1}</div><div className="question-body"><div className="question-meta"><span>{question.label}</span><em>{question.selectionMode === "multiple" ? "Bisa pilih beberapa" : "Pilih satu"}</em></div><h2>{question.question}</h2>{question.why && <p>{question.why}</p>}<div className="option-row">{question.options?.map((option) => { const selected = draft.selected.includes(option); return <button type="button" aria-pressed={selected} className={selected ? "selected" : ""} key={option} onClick={() => toggleQuestionOption(question, option)}>{selected && <Check size={14} />}{option}</button>; })}</div><textarea placeholder={question.selectionMode === "multiple" ? "Tambahkan jawaban lain (opsional)..." : "Atau tulis jawaban sendiri..."} value={draft.custom} onChange={(event) => updateCustomAnswer(question, event.target.value)} /></div></div>; })}</div><div className="stage-actions"><button className="text-button" onClick={() => setPhase("idea")}>Kembali ke ide</button><button className="primary-button" onClick={submitAnswers} disabled={!!busy}>Lanjutkan analisis <ArrowRight size={17} /></button></div></section>}

        {phase === "review" && <section className="stage review-stage"><span className="stage-kicker"><Check size={16} /> Konfirmasi ruang lingkup</span><h1>Cek pemahaman AI sebelum dokumen dibuat.</h1><div className="summary-card"><span>Ringkasan proyek</span><textarea value={project.spec.summary} onChange={(event) => updateSpec({ summary: event.target.value })} /></div><div className="answer-grid">{project.spec.answers.map((answer, index) => <div key={`${answer.question}-${index}`}><span>Keputusan {String(index + 1).padStart(2, "0")}</span><strong>{answer.question}</strong><p>{answer.answer}</p></div>)}</div><div className="doc-selector"><div><span className="stage-kicker"><FileCode2 size={16} /> Paket dokumen otomatis</span><h2>AI memilih file yang relevan.</h2><p>Rekomendasi dibuat dari hasil wawancara. PRD, desain, dan catatan keputusan selalu disertakan; file lain tetap bisa lu ubah sebelum mulai.</p>{canResumeGeneration && <div className="resume-note"><RefreshCw size={14} /><span>{completedSelectedDocuments} dokumen sudah tersimpan. Proses berikutnya melanjutkan {remainingDocuments} dokumen yang tersisa.</span></div>}</div><div className="doc-options">{DOC_OPTIONS.map(([name, description]) => { const selected = selectedDocs.includes(name); const recommendation = documentRecommendations.find((item) => item.name === name); const required = REQUIRED_DOCUMENTS.has(name); return <button type="button" key={name} aria-pressed={selected} disabled={required} className={`${selected ? "selected" : ""} ${required ? "required" : ""}`} onClick={() => toggleDocument(name)}><span className="select-box">{selected && <Check size={14} />}</span><span><strong>{name}{required && <small>Wajib</small>}</strong><em>{recommendation?.reason || description}</em></span></button>; })}</div></div><div className="stage-actions"><button className="text-button" onClick={() => setPhase("interview")}>Revisi jawaban</button>{project.documents.length > 0 && <button className="ghost-button" onClick={() => { setActiveDoc(project.documents[0].name); setPhase("documents"); }}><FileText size={15} /> Buka {project.documents.length} dokumen selesai</button>}<button className="primary-button" onClick={generateDocuments} disabled={!!busy}>{canResumeGeneration ? `Lanjutkan ${remainingDocuments} dokumen` : `Buat ${selectedDocs.length} dokumen`} <Sparkles size={17} /></button></div></section>}

        {phase === "documents" && <section className="documents-stage"><aside className="document-list"><div><span className="stage-kicker"><FileText size={16} /> Dokumen proyek</span><h2>{project.documents.length} file siap ditinjau</h2></div>{project.documents.map((doc) => <button key={doc.name} onClick={() => setActiveDoc(doc.name)} className={activeDoc === doc.name ? "active" : ""}><FileText size={16} /><span><strong>{doc.name}</strong><em>{doc.mode === "demo" ? "Draf demo" : "Dibuat AI"}</em></span><ChevronRight size={15} /></button>)}<button className="regenerate" onClick={() => setPhase("review")}><RefreshCw size={15} /> Atur ulang paket</button></aside><div className="document-editor">{currentDocument ? <><div className="editor-toolbar"><div><strong>{currentDocument.name}</strong><span>{currentDocument.content.length.toLocaleString("id-ID")} karakter</span></div><div className="view-tabs"><button className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}>Preview</button><button className={view === "source" ? "active" : ""} onClick={() => setView("source")}>Markdown</button></div><button className="download-button" onClick={() => regenerateSingleDocument(currentDocument.name)} disabled={!!busy} title="Buat ulang dokumen ini saja"><RefreshCw size={14} className={busy ? "spin" : ""} /> Buat ulang</button><button type="button" className={`download-button copy-button ${copiedDoc === currentDocument.name ? "copied" : ""}`} onClick={() => copyDocument(currentDocument)} title="Salin isi dokumen ke clipboard">{copiedDoc === currentDocument.name ? (<><Check size={14} /> Tersalin!</>) : (<><Copy size={14} /> Salin</>)}</button><button className="download-button" onClick={() => downloadDocument(currentDocument)}><Download size={16} /> Unduh</button></div>{view === "preview" ? <div className="preview-scroll"><MarkdownPreview content={currentDocument.content} /></div> : <textarea className="source-editor" value={currentDocument.content} onChange={(event) => updateDocument(event.target.value)} spellCheck={false} />}</> : <div className="empty-doc">Pilih dokumen untuk ditinjau.</div>}</div></section>}
      </div>
    </section>
  </main>;
}
