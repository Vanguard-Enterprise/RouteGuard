FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/api

FROM gcr.io/distroless/static-debian12
COPY --from=builder /api /api
COPY --from=builder /app/migrations /migrations
EXPOSE 8080
ENTRYPOINT ["/api"]
