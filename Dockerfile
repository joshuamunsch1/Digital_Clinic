# Linden Clinic — production image (Next.js + Prisma).
FROM node:20-slim AS base
WORKDIR /app
# Prisma needs OpenSSL at build and runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies. The `postinstall` hook runs `prisma generate`, which
# needs the schema — so prisma/ must be copied BEFORE npm install, not with the
# rest of the source below. Both layers stay cached until their inputs change.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

# Build. `.env` is not copied into the image (see .dockerignore), so give
# DATABASE_URL a default here — Prisma needs it defined at build time, and
# the compose file / hosting platform overrides it at runtime.
ENV DATABASE_URL="file:/app/prisma/dev.db"
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Boot: apply the schema, seed demo data if (and only if) the database is still
# empty, then start on $PORT (hosting platforms inject it; defaults to 3000).
# For SQLite, mount a volume on /app/prisma so the database file — and anything
# entered in the demo — survives restarts. Without a volume the container comes
# up freshly seeded every time, which is fine for a throwaway demo.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx prisma/seed-if-empty.ts && npm run start -- -p ${PORT:-3000} -H 0.0.0.0"]
