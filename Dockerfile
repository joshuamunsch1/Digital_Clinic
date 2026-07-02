# Linden Clinic — production image (Next.js + Prisma).
FROM node:20-slim AS base
WORKDIR /app
# Prisma needs OpenSSL at build and runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies (postinstall runs `prisma generate`).
COPY package.json package-lock.json* ./
RUN npm install

# Build.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Apply the schema to the database, then start. For SQLite, mount a volume on
# /app/prisma so the database file persists across restarts. Seed once with:
#   docker compose exec app npm run db:seed
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]
