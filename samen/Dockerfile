FROM node:20-alpine
WORKDIR /app
COPY package.json game.js world.js server.js ./
COPY public/ public/
RUN mkdir -p /data && chown node:node /data
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1
CMD ["node", "server.js"]
