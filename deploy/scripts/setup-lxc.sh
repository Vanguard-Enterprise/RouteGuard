#!/bin/bash
# Sets up an LXC container for RouteGuard deployment
set -e

echo "=== RouteGuard LXC Setup ==="

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Configure UFW
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

echo "Setup complete. Please log out and back in for Docker group to take effect."
