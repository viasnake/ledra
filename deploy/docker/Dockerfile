FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY deploy/docker/server.mjs ./deploy/docker/server.mjs

RUN npm ci
RUN npm run build

ENV PORT=8080
ENV CATALOGA_REGISTRY_PATH=/app/registry
EXPOSE 8080

CMD ["node", "deploy/docker/server.mjs"]
