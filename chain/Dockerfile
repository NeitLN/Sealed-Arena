# syntax=docker/dockerfile:1
# Node image for the Sealed L1: avalanchego, the Subnet-EVM plugin and sealed-localnet,
# all built from chain/.work/avalanchego (pinned tag + chain/patches applied by fetch.sh).
# Build context: chain/. Use chain/scripts/build.sh.

ARG GO_VERSION=1.26.10

FROM golang:${GO_VERSION}-bookworm AS builder
WORKDIR /src

COPY .work/avalanchego/ ./
COPY localnet/ ./tests/sealed-localnet/

ARG AVALANCHEGO_COMMIT
ENV AVALANCHEGO_COMMIT=${AVALANCHEGO_COMMIT}
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    ./scripts/build.sh \
 && ./graft/subnet-evm/scripts/build.sh /out/plugins/srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy \
 && go build -o /out/sealed-localnet ./tests/sealed-localnet \
 && cp build/avalanchego /out/avalanchego

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/avalanchego /avalanchego/avalanchego
COPY --from=builder /out/plugins/ /avalanchego/plugins/
COPY --from=builder /out/sealed-localnet /usr/local/bin/sealed-localnet
COPY entrypoint.sh /usr/local/bin/sealed-entrypoint
RUN chmod +x /usr/local/bin/sealed-entrypoint
VOLUME /data
EXPOSE 9650
ENTRYPOINT ["/usr/local/bin/sealed-entrypoint"]
