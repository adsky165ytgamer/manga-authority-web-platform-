FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
COPY backend ./backend
RUN ./node_modules/.bin/tsc -p backend/tsconfig.json

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY package.json ./package.json
EXPOSE 8787
CMD ["node", "backend/dist/server.js"]
