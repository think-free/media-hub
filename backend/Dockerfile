FROM golang:1.22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod ./
RUN go mod tidy
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache imagemagick ffmpeg
RUN adduser -D -H -s /sbin/nologin app
RUN mkdir -p /data/thumbs && chown -R app:app /data
USER app
WORKDIR /app
COPY --from=build /out/server /app/server
COPY migrations /app/migrations
EXPOSE 8080
ENTRYPOINT ["sh","-lc","until nc -z db 5432; do echo 'waiting for db...'; sleep 1; done; /app/server"]