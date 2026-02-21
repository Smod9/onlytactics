FROM node:22-alpine AS client-builder

WORKDIR /app

COPY client-root/package*.json ./
RUN npm ci

COPY client-root/ ./
RUN npm run build -- --mode production

FROM node:22-alpine AS server-builder

WORKDIR /app/server

COPY package*.json ./
RUN npm ci

RUN ln -s /app/server/node_modules /app/node_modules

COPY . .

COPY src-parent /tmp/src-parent
RUN mv /tmp/src-parent /app/src

RUN npm run build

FROM node:22-alpine

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=server-builder /app/server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/src ./src
COPY --from=server-builder /app/src ../src

COPY --from=client-builder /app/dist ./public

EXPOSE 8080

CMD ["npm", "run", "start"]
