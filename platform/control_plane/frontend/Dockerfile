FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config (can be overridden via volume mount for local dev)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built frontend assets
COPY dist/ /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
