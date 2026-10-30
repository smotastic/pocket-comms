# The bookmarks API server. Build from the repository root:
#   docker build -f blueprints/bookmarks/apps/server/Dockerfile -t bookmarks-server .
# The default command serves the API; `node --enable-source-maps dist/migrate.js` runs the
# migrations as a one-shot container before the server starts. Both read DATABASE_URL and PORT.

FROM node:26.12.0-alpine3.24 AS build
WORKDIR /repo
ENV CI=true HUSKY=0 NX_DAEMON=false NX_NO_CLOUD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Node 26 ships without Corepack, so install the pnpm release that `packageManager` pins.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm nx run bookmarks-server:build
# Production dependencies only, with the workspace packages and their `dist` copied in.
RUN pnpm --filter @pocket-comms/bookmarks-server deploy --legacy --prod /out

FROM node:26.12.0-alpine3.24
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
