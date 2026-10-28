# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM quay.io/keycloak/keycloak:26.8.1@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b AS distribution

FROM amazoncorretto:21.0.13-al2023-headless@sha256:212faf5f8f93d8f4854a3d89528834d11ad2d685de80721d4d24ac2fdd3e379e
# AL2023 pins repositories; consume the reviewed security snapshot rather than the base image's older one.
RUN dnf --releasever=2023.12.20261026 upgrade --security -y && dnf clean all && java -version
COPY --from=distribution --chown=1000:0 /opt/keycloak /opt/keycloak
# Replace the vulnerable Guava artifact in place: Quarkus records this exact path.
# Maven SHA-256 pins actual JAR bytes; embedded Maven metadata retains the new version.
ADD --checksum=sha256:b530942257fb935f8b2cfaa5f8eb5bd59c555fd8e8d01b8ce98912e077ea606c --chown=1000:0 https://repo1.maven.org/maven2/com/google/guava/guava/33.7.2-jre/guava-33.7.2-jre.jar /opt/keycloak/lib/lib/main/com.google.guava.guava-33.6.0-jre.jar
ENV KC_RUN_IN_CONTAINER=true
WORKDIR /opt/keycloak
USER 1000:0
EXPOSE 8080 8443 9000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
