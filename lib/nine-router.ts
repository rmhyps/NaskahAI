import { env } from "cloudflare:workers";

export type RouterModelItem = {
  id: string;
  name: string;
  ownedBy: string;
};

export type ModelsResponse = {
  models: RouterModelItem[];
  defaultModel: string;
  source: "9router" | "fallback";
  error?: string;
};

export function normalizeRouterUrl(baseUrl: string, subPath: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  const cleanPath = subPath.startsWith("/") ? subPath : `/${subPath}`;

  if (trimmedBase.endsWith("/v1")) {
    if (cleanPath.startsWith("/v1/")) {
      return `${trimmedBase}${cleanPath.slice(3)}`;
    }
    return `${trimmedBase}${cleanPath}`;
  }

  if (cleanPath.startsWith("/v1/")) {
    return `${trimmedBase}${cleanPath}`;
  }

  return `${trimmedBase}/v1${cleanPath}`;
}

export function getRouterConfig() {
  const cfEnv = (() => {
    try {
      return env as unknown as Record<string, string | undefined>;
    } catch {
      return undefined;
    }
  })();

  const baseUrl = (typeof process !== "undefined" && process.env?.NINE_ROUTER_BASE_URL)
    ? process.env.NINE_ROUTER_BASE_URL
    : cfEnv?.NINE_ROUTER_BASE_URL ?? "";

  const apiKey = (typeof process !== "undefined" && process.env?.NINE_ROUTER_API_KEY)
    ? process.env.NINE_ROUTER_API_KEY
    : cfEnv?.NINE_ROUTER_API_KEY ?? "";

  const defaultModel = (typeof process !== "undefined" && process.env?.NINE_ROUTER_MODEL)
    ? process.env.NINE_ROUTER_MODEL
    : cfEnv?.NINE_ROUTER_MODEL ?? "";

  return {
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    defaultModel: defaultModel.trim(),
  };
}

export function sanitizeErrorMessage(message: string, apiKey?: string): string {
  let cleaned = message;
  if (apiKey && apiKey.length > 3) {
    cleaned = cleaned.split(apiKey).join("[REDACTED]");
  }
  return cleaned.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer [REDACTED]");
}
