FROM quay.io/keycloak/keycloak:26.8.1@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b AS distribution

FROM amazoncorretto:21.0.13-al2023-headless@sha256:212faf5f8f93d8f4854a3d89528834d11ad2d685de80721d4d24ac2fdd3e379e
# AL2023 pins repositories; consume the reviewed security snapshot rather than the base image's older one.
RUN dnf --releasever=2023.12.20261021 upgrade --security -y && dnf clean all && java -version
COPY --from=distribution --chown=1000:0 /opt/keycloak /opt/keycloak
ENV KC_RUN_IN_CONTAINER=true
WORKDIR /opt/keycloak
USER 1000:0
EXPOSE 8080 8443 9000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
