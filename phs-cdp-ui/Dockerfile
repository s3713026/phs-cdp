# PHS CDP UI — Dockerfile
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

# Fix file permissions — files copied from macOS may be 600 (owner-only).
# Nginx runs as a different user, so it needs at least read permission.
RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; \
 && find /usr/share/nginx/html -type d -exec chmod 755 {} \;

EXPOSE 80
