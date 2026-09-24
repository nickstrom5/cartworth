# The Cartworth web app (server + browser app). The marketing site (site/) deploys separately to
# Cloudflare; the iPhone app (ios/) is built in Xcode. See ops/deploy-web.md.
#
# Run exactly ONE instance: politeness to retailers (one request in flight per retailer, 700 ms apart)
# and the per-visitor limits are enforced per process, so two instances would double the load every
# retailer sees. /data must be a persistent volume (the shared cache and price history, SQLite).
FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY shared ./shared
COPY public ./public
COPY scripts ./scripts
ENV HOST=0.0.0.0 PORT=8080 BASKET_DATA_DIR=/data BASKET_TRUST_PROXY=1 NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/api/health',{headers:{'x-forwarded-for':'127.0.0.2'}}).then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
