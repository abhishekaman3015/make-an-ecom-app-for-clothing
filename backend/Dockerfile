FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/maithilcart ./cmd/api

FROM alpine:3.21
WORKDIR /app
COPY --from=build /bin/maithilcart /bin/maithilcart
COPY migrations ./migrations
EXPOSE 8080
CMD ["/bin/maithilcart"]
