# The bookmarks web app. Build from the repository root:
#   docker build -f blueprints/bookmarks/apps/web/Dockerfile -t bookmarks-web .
# nginx serves the built app on port 8080 and proxies /api, /docs and /health to the server, so
# the browser sees one origin. BOOKMARKS_SERVER_HOST and BOOKMARKS_SERVER_PORT name the server.

FROM node:26.12.0-alpine3.24 AS build
WORKDIR /repo
ENV CI=true HUSKY=0 NX_DAEMON=false NX_NO_CLOUD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Node 26 ships without Corepack, so install the pnpm release that `packageManager` pins.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm nx run bookmarks-web:build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
# The entrypoint renders the template into conf.d with these values and the container's own DNS
# resolver, so nginx looks the server up per request and follows a recreated server container.
ENV BOOKMARKS_SERVER_HOST=bookmarks-server \
    BOOKMARKS_SERVER_PORT=3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY blueprints/bookmarks/apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/blueprints/bookmarks/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
