# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/client/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx nx build client --configuration=production

# The client is a small Node server now, not static files: it renders the
# public pages per request and serves the browser bundle beside them. The
# Angular build bundles the server's dependencies into `server/`, so nothing
# is installed here.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000
COPY --from=build /app/dist/apps/client ./
USER node
EXPOSE 4000
# Set by whatever runs the container:
#   API_INTERNAL_ORIGIN  where this server reaches the API without leaving the
#                        network, e.g. http://api:3000
#   NG_ALLOWED_HOSTS     the site's domain; Angular refuses any other Host header
CMD ["node", "server/server.mjs"]
