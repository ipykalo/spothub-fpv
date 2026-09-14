# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npx nx build api --configuration=production

# Betaflight's blackbox_decode, which the worker runs to turn .bbl logs into
# CSV. Built from source at a pinned commit: the project publishes no Linux
# binaries. It is GPL-3.0, and runs as a separate program, never linked in.
# Also builds alone, for a machine with no C compiler:
#   docker build --target blackbox-decode -t spothub-blackbox-decode -f apps/api/Dockerfile .
FROM alpine:3.20 AS blackbox-decode
ARG BLACKBOX_TOOLS_REV=f832acf9cd9dbe5ad8220de1a5f4eb4021523d72
RUN apk add --no-cache build-base git \
 && git init /src \
 && git -C /src fetch --depth 1 https://github.com/betaflight/blackbox-tools.git "$BLACKBOX_TOOLS_REV" \
 && git -C /src checkout FETCH_HEAD \
 && make -C /src obj/blackbox_decode \
 && install -m 755 /src/obj/blackbox_decode /usr/local/bin/blackbox_decode \
 && rm -rf /src
ENTRYPOINT ["blackbox_decode"]

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

# musl-built, like this Alpine image, so it runs here as it did where it was built.
COPY --from=blackbox-decode /usr/local/bin/blackbox_decode /usr/local/bin/blackbox_decode

USER app
EXPOSE 3000

# Migrations are a startup step, never a build layer: building an image must
# not require — or touch — a database.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
