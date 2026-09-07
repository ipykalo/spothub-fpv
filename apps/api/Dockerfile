# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npx nx build api --configuration=production

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# openssl is required by the Prisma query engine on Alpine.
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist/apps/api ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

USER app
EXPOSE 3000

# Migrations are a startup step, never a build layer: building an image must
# not require — or touch — a database.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
