import {
  getRouterConfig,
  normalizeRouterUrl,
  type ModelsResponse,
  type RouterModelItem,
} from "../../../lib/nine-router";

type RawModelItem = {
  id?: unknown;
  name?: unknown;
  owned_by?: unknown;
  ownedBy?: unknown;
};

export async function GET() {
  const { baseUrl, apiKey, defaultModel } = getRouterConfig();

  if (!baseUrl || !apiKey) {
    const fallbackResponse: ModelsResponse = {
      models: [],
      defaultModel,
      source: "fallback",
      error: "Tidak dapat mengambil daftar model dari 9Router.",
    };
    return Response.json(fallbackResponse, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const endpoint = normalizeRouterUrl(baseUrl, "/v1/models");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const fallbackResponse: ModelsResponse = {
        models: [],
        defaultModel,
        source: "fallback",
        error: "Tidak dapat mengambil daftar model dari 9Router.",
      };
      return Response.json(fallbackResponse, {
        status: response.status >= 500 ? response.status : 502,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const json = (await response.json()) as { data?: unknown };
    if (!json || !Array.isArray(json.data)) {
      const fallbackResponse: ModelsResponse = {
        models: [],
        defaultModel,
        source: "fallback",
        error: "Tidak dapat mengambil daftar model dari 9Router.",
      };
      return Response.json(fallbackResponse, {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const seen = new Set<string>();
    const models: RouterModelItem[] = [];

    for (const item of json.data as RawModelItem[]) {
      if (typeof item?.id === "string") {
        const id = item.id.trim();
        if (id && !seen.has(id)) {
          seen.add(id);
          const name =
            typeof item.name === "string" && item.name.trim()
              ? item.name.trim()
              : id;
          const ownedBy =
            typeof item.owned_by === "string" && item.owned_by.trim()
              ? item.owned_by.trim()
              : typeof item.ownedBy === "string" && item.ownedBy.trim()
              ? item.ownedBy.trim()
              : id.includes("/")
              ? id.split("/")[0]
              : "system";

          models.push({ id, name, ownedBy });
        }
      }
    }

    models.sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" })
    );

    const payload: ModelsResponse = {
      models,
      defaultModel,
      source: "9router",
    };

    return Response.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    clearTimeout(timeoutId);
    const fallbackResponse: ModelsResponse = {
      models: [],
      defaultModel,
      source: "fallback",
      error: "Tidak dapat mengambil daftar model dari 9Router.",
    };
    return Response.json(fallbackResponse, {
      status: controller.signal.aborted ? 504 : 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
