FROM node:20-bookworm-slim AS build

ARG YANEURAOU_REF=master
ARG YANEURAOU_TARGET_CPU=SSE42

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    clang \
    git \
    lld \
    make \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN sh scripts/build-yaneuraou.sh

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV YANEURAOU_PATH=/app/engine/yaneuraou
ENV YANEURAOU_EVAL_DIR=/app/engine/eval
ENV YANEURAOU_EDITION=YANEURAOU_ENGINE_MATERIAL
ENV YANEURAOU_MATERIAL_LEVEL=9
ENV YANEURAOU_THREADS=1
ENV YANEURAOU_HASH=16
ENV YANEURAOU_MULTIPV=1

COPY --from=build /app /app

CMD ["npm", "start"]
