FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
ENV SQLX_OFFLINE=true
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json -p media-service
COPY . .
RUN cargo build --release -p media-service

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10000 --no-create-home --shell /usr/sbin/nologin appuser
WORKDIR /app
COPY --from=builder /app/target/release/media-service .
# Pre-create the uploads dir owned by appuser. Fresh volumes inherit this
# ownership; existing volumes (already root-owned from earlier deploys) get
# chowned by the deploy script before this image starts.
RUN mkdir -p /app/uploads && chown -R 10000:10000 /app/uploads
USER 10000
EXPOSE 3006
CMD ["./media-service"]
