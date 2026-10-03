FROM docker.io/library/debian:bookworm-slim AS legacy-build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSLO https://cdn.openbsd.org/pub/OpenBSD/LibreSSL/libressl-3.3.6.tar.gz \
 && echo '3f28849365e1190db2baf9014ff9686012c25b1ca6df8b3a085f789e24fe4b9a  libressl-3.3.6.tar.gz' | sha256sum -c - \
 && tar -xzf libressl-3.3.6.tar.gz \
 && cd libressl-3.3.6 \
 && ./configure --prefix=/opt/legacy --disable-shared \
 && make -j2 >/dev/null && make install >/dev/null

FROM docker.io/library/node:24-bookworm-slim
LABEL org.opencontainers.image.title="hp-ilo-genie" \
      org.opencontainers.image.source="https://github.com/ryancnelson/hp-ilo-genie" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.description="Local browser console and legacy TLS bridge for HP iLO"
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=legacy-build /opt/legacy/bin/openssl /opt/legacy/bin/openssl
COPY --from=legacy-build /opt/legacy/etc/ssl/openssl.cnf /opt/legacy/etc/ssl/openssl.cnf
COPY --from=legacy-build /build/libressl-3.3.6.tar.gz /usr/local/share/hp-ilo-genie/libressl-3.3.6.tar.gz
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY test ./test
COPY vendor ./vendor
COPY Dockerfile compose.yaml hp-ilo-genie README.md LICENSE NOTICE ./
RUN chmod +x scripts/*.sh hp-ilo-genie && mkdir /data && chown node:node /data \
 && tar -czf /tmp/source.tar.gz --exclude=node_modules . && mv /tmp/source.tar.gz /app/source.tar.gz
ENV NODE_ENV=production DATA_DIR=/data LEGACY_OPENSSL=/opt/legacy/bin/openssl
USER node
EXPOSE 8088 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node scripts/healthcheck.cjs
ENTRYPOINT ["/usr/bin/tini", "--", "node", "src/launcher.cjs"]
