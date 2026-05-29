FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Sharp powers /_next/image at runtime. Next traces it into the standalone
# bundle when it's a direct dep, but we copy it explicitly so a missed trace
# never silently downgrades the image optimizer to identity-passthrough.
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
# node:20-alpine ships with the `node` user (UID 1000); drop privileges so
# a code-exec bug in the Next.js standalone server doesn't get root in the
# container.
USER node
EXPOSE 3009
CMD ["node", "server.js"]
