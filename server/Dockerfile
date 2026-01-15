FROM node:20-alpine AS builder

WORKDIR /app/server

COPY package*.json ./
# Install all dependencies (including dev) for building
RUN npm ci

# Ensure shared source files (../src) can resolve node_modules via /app/node_modules
RUN ln -s /app/server/node_modules /app/node_modules

COPY . .

# Copy src directory (copied into server as src-parent by build script)
# Move it to the parent directory where tsconfig expects it
COPY src-parent /tmp/src-parent
RUN mv /tmp/src-parent /app/src

RUN npm run build

FROM node:20-alpine

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/server/package*.json ./
# Reinstall only production dependencies
RUN npm ci --omit=dev
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/src ./src
COPY --from=builder /app/src ../src

EXPOSE 8080

CMD ["npm", "run", "start"]

