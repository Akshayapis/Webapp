# U APP — static build + server-side APK build service
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/var/uapp-data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY kaggle ./kaggle
RUN mkdir -p /var/uapp-data/sources /var/uapp-data/artifacts
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["node", "server/index.mjs"]
