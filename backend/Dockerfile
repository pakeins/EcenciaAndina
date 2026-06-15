FROM node:22.22.3-slim AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM gcr.io/distroless/base-debian12:nonroot

ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=dependencies /lib/x86_64-linux-gnu/libstdc++.so.6 /lib/x86_64-linux-gnu/libstdc++.so.6
COPY --from=dependencies --chown=65532:65532 /app/node_modules ./node_modules
COPY --chown=65532:65532 index.js ./
COPY --chown=65532:65532 src ./src

EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["index.js"]
