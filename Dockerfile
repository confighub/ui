# Build with this directory as the context. In the ConfigHub repository, where the
# @confighub/* packages are ../public/js, pass that as the build context `js`:
#
#     docker build --build-context js=public/js ui/
#
# That context is the packages' source, which the builder builds before installing
# this app. Everywhere else `js` is the empty stage below, and the packages come from npm.
FROM scratch AS js

# The app is static files, the same for every platform, so the build runs on the
# builder's own platform once; only the nginx stage below is per platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app/ui
COPY --from=js / /app/public/js/
RUN if [ -f ../public/js/package.json ]; then \
      cd ../public/js && npm ci --no-audit --no-fund && npm run build; \
    fi
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Create a dedicated non-root user with UID 1000
RUN addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser

# Create and set up directories with proper permissions
RUN mkdir -p /var/cache/nginx /var/log/nginx /tmp /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /tmp /usr/share/nginx/html /etc/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx

# Copy built files and config
COPY --from=builder /app/ui/dist /usr/share/nginx/html
# The license, and the notices for the npm packages bundled into the app.
COPY LICENSE THIRD_PARTY_LICENSES.txt /licenses/
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chown -R appuser:appgroup /usr/share/nginx/html /etc/nginx && \
    chmod +x /docker-entrypoint.sh

# Switch to non-root user
USER 1000

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
