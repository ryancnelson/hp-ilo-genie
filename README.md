# HP iLO Genie

A modern browser console **and** an SSL compatibility proxy for old HP iLO,
packaged together in one Docker/Podman image. No Java applet, Java Web Start,
.NET client, or host-side legacy TLS setup is required.

Built from a working session with a **ProLiant DL360 G7, iLO 3 firmware 1.94**.
The console decodes iLO's proprietary DVC stream using
[mildsunrise/ilo-protocol](https://github.com/mildsunrise/ilo-protocol).
This is not a generic VNC proxy. Other iLO versions have not been verified.

## Quick start

Requires Docker or Podman with access to your iLO's LAN. Nothing is published
to an image registry by these commands.

```bash
git clone https://github.com/ryancnelson/hp-ilo-genie.git
cd hp-ilo-genie
./hp-ilo-genie build
./hp-ilo-genie start 192.0.2.10  # replace with your iLO address
```

Open **http://localhost:8088/** and sign in with your iLO credentials. Click
the screen to send keyboard and mouse input; click outside it to release input.
The separate management website is **https://localhost:8443/**. Its generated
localhost certificate is self-signed; your browser will ask you to accept it.

Both components run inside the container:

| Address | Purpose |
| --- | --- |
| `http://localhost:8088/` | HTML canvas console, keyboard and mouse |
| `https://localhost:8443/` | Original iLO management website through modern TLS |
| Container-only `127.0.0.1:8080` | Internal API transport into the legacy TLS client |

For a Docker-compatible Podman socket, the default `docker` command works.
For the Podman CLI directly, prefix commands with `CONTAINER_ENGINE=podman`.

## Management

```bash
./hp-ilo-genie status
./hp-ilo-genie logs
./hp-ilo-genie doctor
./hp-ilo-genie stop
```

`stop` removes this utility's container and keeps the certificate volume. It
does not reboot, power off, or log out other users of the server. Start it again
with the same command; sign in again because authentication stays in memory.

If the default ports are occupied:

```bash
GENIE_PORT=8089 GENIE_HTTPS_PORT=8444 ./hp-ilo-genie start 192.0.2.10
```

Docker Compose is also supported:

```bash
ILO_HOST=192.0.2.10 docker compose up --build -d
docker compose down
```

The shell launcher does not require the Compose plugin.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ILO_HOST` | Required | Device IPv4 address or DNS hostname |
| `ILO_PORT` | `443` | Device HTTPS port |
| `ILO_CIPHER` | `DES-CBC3-SHA` | Outbound cipher selection |
| `ILO_CONNECT_HOST` | Same as `ILO_HOST` | Optional TCP relay or alternate route |
| `ILO_CONSOLE_PORT` | Device-reported port | Optional remote-console port override for a relay |
| `GENIE_PORT` | `8088` | Host console port (launcher / Compose) |
| `GENIE_HTTPS_PORT` | `8443` | Host management port (launcher / Compose) |
| `GENIE_NAME` | `hp-ilo-genie` | Container name (launcher) |
| `GENIE_IMAGE` | `hp-ilo-genie:0.1.0` | Local image name (launcher) |
| `CONTAINER_ENGINE` | `docker` | Docker-compatible command (launcher) |
| `GENIE_SESSION_FILE` | Unset | Host file containing an existing iLO session; launcher copies it through stdin into container tmpfs |
| `ILO_SESSION_FILE` | Unset | Optional readable file inside the container containing an existing session token |
| `DEBUG` | Unset | Log non-secret protocol diagnostics |

Credentials are entered in the console page and sent only to the configured
iLO. Passwords and fresh session tokens are not saved. A mounted session file
is optional; never include it in the image. The image's build context uses an
explicit allowlist to exclude local secrets and generated certificates.

To reuse an already authenticated session, set `GENIE_SESSION_FILE` when
running the launcher. The token is copied into a mode-0600 file on container
tmpfs and is not included in Docker arguments, logs, volumes, or image layers.

The management proxy offers TLS 1.2+ to the browser. The dedicated LibreSSL
3.3.6 client handles old ciphers only on the outbound connection to iLO.
Protocol negotiation is automatic: forcing TLS 1.1 caused bad-record-MAC errors
on the tested device. The default cipher negotiated TLS 1.1 with 3DES.
Legacy device certificates are not validated, matching the original bridge.
The container runs as an unprivileged user and publishes ports only on
`127.0.0.1`; the console's HTTP connection stays on the local machine.

## Build and transfer

The Dockerfile builds the legacy client from an official source archive with
a pinned SHA-256 checksum. Node dependencies use `package-lock.json`. The
multi-stage build was tested on Linux ARM64. It is intended to build on x86-64
as well, but that platform has not yet been tested. An image built for one
architecture must run on that architecture or under emulation.

```bash
./hp-ilo-genie export hp-ilo-genie-0.1.0.tar
# On a machine with the same architecture:
docker load -i hp-ilo-genie-0.1.0.tar
```

## Scope and troubleshooting

- Live 1024 × 768 video and keyboard input were verified on a DL360 G7 using
  the original host-based client. The combined container was verified to serve
  both web endpoints and complete the legacy TLS handshake. Its full console
  handoff still needs a fresh iLO login; the existing session expired during
  packaging. The graphical mouse path has not been tested against a desktop.
- Close an existing console before opening another: the tested iLO permits
  only one active console connection. A live console may remain connected
  after its web session expires; a new connection can still need a fresh login.
- The device must grant remote-console access; this utility does not bypass
  iLO permissions or license requirements.
- The device-reported console port (17990 on the tested iLO) must be reachable
  from the container in addition to HTTPS.
- Use **Reconnect** after a dropped connection or **Sign in** for an expired
  session. **Refresh screen** asks iLO for a full redraw.
- `doctor` checks network reachability and the legacy TLS handshake. On macOS,
  also check that Docker/Podman's VM can reach the management LAN.
- Virtual media, power controls, clipboard paste, audio, and multi-user input
  arbitration are not implemented. Browser-reserved keyboard shortcuts may be
  intercepted by your browser or operating system.

## Container networking

The runtime and host network setup matter. Normal outbound TCP connections to
an iLO do not require a privileged container. On Linux, investigate the
container's route and the host firewall if the connection fails. A host-network
run can help distinguish network-namespace issues, but it also changes port
binding behavior and is not the launcher's default.

On macOS, Podman and Docker Desktop run Linux containers in a VM. The
`--privileged` flag changes permissions inside that Linux environment; it does
not itself move a container onto the Mac's network or grant macOS Local Network
permission to the VM's networking process. In rootless Podman, it also cannot
grant more privileges than the user running the container. Whether privileges
help depends on which layer is actually blocking traffic.

The tested Podman setup could not reach the management LAN directly, even with
host networking. The loopback TCP relay below worked. This was observed on one
Mac; it is not a general requirement for running the image. Privileged mode
has not been tested or enabled by this project.

References: [Docker runtime privileges](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities),
[Docker Desktop networking](https://docs.docker.com/desktop/features/networking/),
[Podman machine](https://docs.podman.io/en/latest/markdown/podman-machine.1.html),
and [Podman privileged mode](https://docs.podman.io/en/latest/markdown/podman-run.1.html#privileged).

### Optional macOS / Podman LAN relay

If the VM cannot reach iLO but your terminal can, the optional `relay` command
provides raw TCP transport through the host. Both SSL translation and the web
UI still run inside the image. This is only needed for affected container VM
network setups and requires Python 3 on the host.

In a terminal with LAN access, keep this running:

```bash
./hp-ilo-genie relay 192.0.2.10
```

In a second terminal:

```bash
ILO_CONNECT_HOST=host.containers.internal ILO_PORT=14443 ILO_CONSOLE_PORT=17991 \
  ./hp-ilo-genie start 192.0.2.10
```

For Docker Desktop use `host.docker.internal`. The relay binds only to host
loopback and forwards only to the configured device's HTTPS and console ports.
It neither decrypts nor records traffic. Stop it with Ctrl-C. If your iLO uses
a console port other than 17990, pass `--console-target PORT` to `relay`.

## Development and credits

### Local checks

```bash
npm ci --ignore-scripts
npm test
```

AGPL-3.0-or-later; see `LICENSE` and `NOTICE`. The browser footer provides this
utility's source bundle. Keep corresponding source and dependency notices with
any redistributed image. `vendor/` includes the exact upstream source revision
for the installed ilo-protocol release. The image also includes the original
LibreSSL source.
