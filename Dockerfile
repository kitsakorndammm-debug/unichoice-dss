# ---------- build หน้าเว็บ ----------
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client ./
RUN npm run build

# ---------- เซิร์ฟเวอร์ ----------
FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server ./
COPY --from=client /app/client/dist /app/client/dist
ENV PORT=4000 NODE_ENV=production
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
