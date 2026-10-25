# Preserve the existing PostgreSQL/Alpine ABI and data-directory format.
FROM postgres:16.6-alpine
ARG APK_MIRROR=https://mirrors.aliyun.com/alpine

RUN sed -i "s|^https://dl-cdn[.]alpinelinux[.]org/alpine/|${APK_MIRROR}/|" /etc/apk/repositories \
    && apk add --no-cache --virtual .pgvector-build-deps build-base git \
    && git clone --depth 1 --branch v0.8.7 \
       https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make OPTFLAGS="" with_llvm=no \
    && make install with_llvm=no \
    && mkdir -p /usr/local/share/doc/pgvector \
    && cp LICENSE /usr/local/share/doc/pgvector/LICENSE \
    && cd / \
    && rm -rf /tmp/pgvector \
    && apk del .pgvector-build-deps
