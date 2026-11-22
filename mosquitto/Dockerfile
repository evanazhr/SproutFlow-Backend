# Config disalin ke dalam image supaya bekerja baik di Docker maupun Podman
# (tidak perlu opsi :Z untuk SELinux) dan memiliki owner/permission yang benar.
FROM eclipse-mosquitto:2

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY passwd /mosquitto/config/passwd
COPY acl /mosquitto/config/acl

# Mosquitto 2.1 menolak file passwd/acl yang world-readable pada versi depan.
# 1883 = UID/GID pengguna `mosquitto` di image upstream.
RUN chown 1883:1883 /mosquitto/config/passwd /mosquitto/config/acl \
    && chmod 600 /mosquitto/config/passwd /mosquitto/config/acl
