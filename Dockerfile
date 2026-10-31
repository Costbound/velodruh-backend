# ==========================================
# 1. Base Image
# ==========================================
FROM node:20-alpine AS base
WORKDIR /app

# ==========================================
# 2. Dependencies Stage (Install all)
# ==========================================
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ==========================================
# 3. Development Build / Target
# ==========================================
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ==========================================
# 4. Production Build Stage
# ==========================================
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ==========================================
# 5. Production Runner Target (Without devDependencies)
# ==========================================
FROM base AS production
ENV NODE_ENV=production

# Install only production dependencies for a lean runtime image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create and switch to non-root security user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs
USER expressjs

EXPOSE 3000
CMD ["node", "dist/index.js"]