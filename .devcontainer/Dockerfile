# Devcontainer image for redinfo.
# Extends the official TypeScript/Node devcontainer and adds Helm for chart validation.

FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

ARG HELM_VERSION=3.16.3
ARG TARGETARCH

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl tar; \
    rm -rf /var/lib/apt/lists/*; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in \
      amd64|x86_64) helmArch="amd64" ;; \
      arm64|aarch64) helmArch="arm64" ;; \
      *) echo "Unsupported architecture for helm: $arch"; exit 1 ;; \
    esac; \
    base="https://get.helm.sh"; \
    tgz="helm-v${HELM_VERSION}-linux-${helmArch}.tar.gz"; \
    curl -fsSL -o "/tmp/${tgz}" "${base}/${tgz}"; \
    curl -fsSL -o "/tmp/${tgz}.sha256" "${base}/${tgz}.sha256"; \
    sha256="$(cat "/tmp/${tgz}.sha256" | tr -d '\n' | tr -d '\r')"; \
    echo "${sha256}  /tmp/${tgz}" | sha256sum -c -; \
    tar -xzf "/tmp/${tgz}" -C /tmp; \
    mv "/tmp/linux-${helmArch}/helm" /usr/local/bin/helm; \
    chmod +x /usr/local/bin/helm; \
    rm -rf "/tmp/${tgz}" "/tmp/${tgz}.sha256" "/tmp/linux-${helmArch}"; \
    helm version
