FROM node:20-alpine AS builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server ./
COPY src ../src

RUN npm run build

FROM node:20-alpine

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/src ./src
COPY --from=builder /app/src ../src

EXPOSE 8080

CMD ["npm", "run", "start"]

