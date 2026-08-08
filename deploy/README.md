# RouteGuard deployment

RouteGuard is now a single Next.js demo application. It has no Go API, PostgreSQL, Redis, RustFS, Mapbox, credentials, or runtime service dependencies.

## Local development

```bash
cd dashboard
npm ci
npm run dev
```

The app listens on `0.0.0.0:13100`. The login form accepts any non-empty value and stores a local demo session in the browser.

## Kubernetes

Build and publish the dashboard image using your cluster's image registry, then update the image in `deploy/k8s/routeguard.yaml` if needed:

```bash
docker build -t routeguard-dashboard:latest dashboard
kubectl apply -f deploy/k8s/routeguard.yaml
```

The manifest creates one Deployment and one ClusterIP Service. There are no Secrets, databases, caches, storage services, or external API URLs to configure.
