FROM node:20-alpine
WORKDIR /app
COPY package.json game.js server.js ./
COPY public/ public/
ENV PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1
CMD ["node", "server.js"]
