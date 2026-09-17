# Devcontainer image for redinfo.
# Extends the official TypeScript/Node devcontainer and adds:
# - Helm for chart validation
# - Claude code CLI for agent-based development
# - Azure CLI, GitHub CLI, and other automation tools

FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

ARG HELM_VERSION=3.16.3
ARG TARGETARCH

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      tar \
      git \
      make \
      build-essential \
      jq \
      yq \
      wget \
      gpg \
      unzip; \
    rm -rf /var/lib/apt/lists/*

# Install Helm
RUN set -eux; \
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

# Install GitHub CLI
RUN set -eux; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gh; \
    rm -rf /var/lib/apt/lists/*; \
    gh --version

# Install Azure CLI
RUN set -eux; \
    curl -fsSL https://aka.ms/InstallAzureCliDeb | bash; \
    az --version

# Install Claude Code and ensure `claude` is on PATH
USER root
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates bash; \
    rm -rf /var/lib/apt/lists/*; \
    su - node -c 'curl -fsSL https://claude.ai/install.sh | bash'; \
    install -d -m 0755 /usr/local/bin; \
    ln -sf /home/node/.local/bin/claude /usr/local/bin/claude

ENV PATH="/usr/local/bin:/home/node/.local/bin:${PATH}"

USER node
