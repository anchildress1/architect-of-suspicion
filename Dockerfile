FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build

FROM node:22-slim AS runner
RUN corepack enable
WORKDIR /app
# Bring build artifacts in already owned by the non-root `node` user that
# ships with the official node image (uid 1000). Avoids a separate chown
# pass and ensures the runtime user can read everything in /app.
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./
# Install prod deps as root, then hand the resulting node_modules over to
# the node user. After this point nothing should run privileged.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
 && chown -R node:node /app
ENV PORT=8080
ENV HOST=0.0.0.0
USER node
EXPOSE 8080
USER node
CMD ["node", "build"]
