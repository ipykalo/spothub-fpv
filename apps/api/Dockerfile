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

COPY --from=build --chown=app:app /app/dist/apps/api ./dist

# The generated client, including the musl query engine the app queries with.
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma

# The CLI's schema engine, which `migrate deploy` needs at startup. The runtime
# `npm ci --ignore-scripts` above leaves @prisma/engines empty, so without this
# the CLI tries to download it on boot — which needs network access at start
# and write access to node_modules that the `app` user deliberately lacks. It
# failed exactly that way the first time this image was run.
COPY --from=build --chown=app:app /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

COPY --from=build --chown=app:app /app/prisma ./prisma

USER app
EXPOSE 3000

# Migrations are a startup step, never a build layer: building an image must
# not require — or touch — a database.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
