# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/client/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx nx build client --configuration=production

FROM nginx:alpine AS runtime
COPY --from=build /app/dist/apps/client/browser /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
