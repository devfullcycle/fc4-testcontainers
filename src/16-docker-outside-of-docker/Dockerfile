FROM node:24.9.0-slim

ARG DOCKER_GROUP_ID=999
ARG USER_ID=1000

# pra dev container com a feature do dood, deixe este trecho comentado
RUN apt update && \
    apt install -y ca-certificates curl && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt update && \
    apt install -y docker-ce-cli docker-buildx-plugin docker-compose-plugin

RUN groupadd -f -g ${DOCKER_GROUP_ID} docker && \
    usermod -aG docker node && \
    usermod -u ${USER_ID} node

WORKDIR /home/node/app

USER node