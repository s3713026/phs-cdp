# PHS CDP UI — Dockerfile
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy all static files to nginx serving directory
COPY . /usr/share/nginx/html

# Write custom nginx config
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location ~* \\.css$ {\n\
        add_header Content-Type text/css;\n\
        try_files $uri =404;\n\
    }\n\
\n\
    location ~* \\.js$ {\n\
        add_header Content-Type application/javascript;\n\
        try_files $uri =404;\n\
    }\n\
\n\
    location / {\n\
        try_files $uri $uri.html $uri/ /index.html;\n\
    }\n\
\n\
    gzip on;\n\
    gzip_types text/css application/javascript application/json;\n\
    gzip_min_length 1024;\n\
\n\
    add_header X-Content-Type-Options nosniff;\n\
    add_header X-Frame-Options SAMEORIGIN;\n\
    add_header X-XSS-Protection "1; mode=block";\n\
}\n' > /etc/nginx/conf.d/default.conf\n\
\n\
EXPOSE 80
