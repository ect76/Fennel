FROM node:22-alpine
# chromium: Percy's own browser (reading pages, searching, previewing his projects)
# git: version history for his projects; fonts so pages render properly in screenshots
RUN apk add --no-cache chromium git font-noto font-noto-emoji ttf-dejavu
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ARG BUILD_REF=dev
ENV BUILD_REF=$BUILD_REF NODE_ENV=production DATA_DIR=/data PORT=3000 CHROMIUM_PATH=/usr/bin/chromium-browser
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1
CMD ["node", "server/index.js"]
