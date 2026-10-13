FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/ ./
COPY database/ /app/database/

RUN chmod 0555 docker-entrypoint.sh \
    && chown -R node:node /app

USER node
EXPOSE 3011

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
