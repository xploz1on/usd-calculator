# Use a pinned lightweight Nginx Alpine image
FROM nginx:1.31.3-alpine

# Copy the static website files to the Nginx html directory
COPY . /usr/share/nginx/html

# Copy the custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ensure cache directories are writable by the nginx user when running rootless
RUN mkdir -p /var/cache/nginx/client_temp && chown -R nginx:nginx /var/cache/nginx

# Expose port 80
EXPOSE 80

# Run Nginx as root so the master process can create /var/run/nginx.pid
USER root

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
