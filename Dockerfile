# Open Alice - build from local source (use in your fork for image build/push)
# See README-Docker.md for build and push to Docker Hub.
FROM node:22-bookworm
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm build
RUN mkdir -p data/config data/brain data/default
EXPOSE 3002
CMD ["node", "dist/main.js"]
