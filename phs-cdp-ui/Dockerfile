# PHS CDP UI — Dockerfile
FROM nginx:alpine

# Copy all static files to nginx serving directory
COPY . /usr/share/nginx/html

# Custom nginx config to handle SPA routing and proxy to BFF
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Serve static files; fallback to index.html for SPA routes
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_types text/html text/css application/javascript application/json;
    gzip_min_length 1024;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
}
NGINX

EXPOSE 80
