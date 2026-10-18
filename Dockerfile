FROM node:22-bookworm-slim AS base

WORKDIR /app

# Aktifkan pnpm melalui Corepack
ENV COREPACK_ENABLE_STRICT=0
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Salin manifest dan pasang dependensi
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Salin seluruh kode sumber proyek
COPY . .

# Jalankan build produksi (Vinext + Vite)
RUN pnpm build

# Port default runtime lokal Cloudflare Worker
EXPOSE 8787

# Mount point untuk persistensi database dan berkas lokal
VOLUME ["/app/.data", "/app/.wrangler/state"]

# Jalankan server Cloudflare Worker lokal via Wrangler (binding ke 0.0.0.0 agar dapat diakses dari host)
CMD ["node", "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", ".wrangler/state", "--ip", "0.0.0.0", "--port", "8787", "--inspector-port", "0"]
