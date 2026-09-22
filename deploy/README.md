# Deploying SpotHub FPV

One VPS, four containers, Caddy in front doing TLS. Nothing is built on the
server: CI publishes both images to GHCR on every push, so a deploy is a pull
and a restart, and a rollback is pinning the previous tag.

**`dev` is where work lands; `master` is what production runs.** A release is
a merge from `dev` into `master`, which builds a `master` image the server
then pulls. The server never runs `dev`: that tag moves with every ticket.

```
                :443  Caddy  ──┬── /api/*  →  api:3000     NestJS
                               └── /*      →  client:4000  Angular, rendered per request

  storage.<domain>  :443  Caddy  ─────────→  minio:9000    photos and logs

  internal only:  postgres:5432
```

Three files live here and nowhere else on the server: `docker-compose.yml`,
`Caddyfile`, and the `.env` you make from `.env.example`.

---

## What you need before starting

- A domain, and access to its DNS.
- A Hetzner CX22 (2 vCPU, 4 GB, 40 GB, x86) with Ubuntu 24.04. **x86, not
  ARM** — CI builds `linux/amd64` images only, and an ARM box would refuse to
  run them.
- The Google OAuth client from development. It gets a second redirect URI.

---

## 1. The server

Create the box with your SSH key attached, then, as root:

```bash
adduser --disabled-password --gecos "" spothub
usermod -aG sudo spothub
rsync --archive --chown=spothub:spothub ~/.ssh /home/spothub/
```

Lock down SSH — password login off, root login off:

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Firewall — only SSH and the web:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

Docker, from Docker's own repository rather than Ubuntu's older package:

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker spothub
```

Log out and back in **as `spothub`** from here on.

> **A 4 GB box with no swap will kill a container under load.** Give it some:
>
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

## 2. DNS

Three records, all `A`, all pointing at the VPS's IPv4 address. Caddy cannot
get a certificate until they resolve, so do this before step 5.

| name      | type | value          |
| --------- | ---- | -------------- |
| `@`       | A    | `<the VPS IP>` |
| `www`     | A    | `<the VPS IP>` |
| `storage` | A    | `<the VPS IP>` |

Check from the server, not from your laptop — a stale local resolver has
wasted an afternoon before now:

```bash
dig +short example.com storage.example.com
```

## 3. The images

The GHCR packages are private by default. Either make
`ipykalo/spothub-fpv/api` and `.../client` public under the repository's
**Packages** settings — they contain no secrets — or log in on the server with
a personal access token that has `read:packages`:

```bash
echo '<token>' | docker login ghcr.io -u ipykalo --password-stdin
```

## 4. The files

From your laptop, in the repository:

```bash
ssh spothub@<the VPS IP> 'mkdir -p /opt/spothub'
scp deploy/docker-compose.yml deploy/Caddyfile deploy/.env.example \
    spothub@<the VPS IP>:/opt/spothub/
```

Then on the server:

```bash
cd /opt/spothub
mv .env.example .env
chmod 600 .env
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 24   # S3_SECRET_KEY
nano .env
```

Fill in every blank. `ALLOWED_EMAILS` is the one that decides whether anyone
can sign in at all; empty means nobody, which is the intended default.

## 5. Google

At https://console.cloud.google.com/apis/credentials, on the existing OAuth
client, add — keeping the localhost ones, so development still works:

- Authorised redirect URI: `https://<SITE_DOMAIN>/api/auth/google/callback`
- Authorised JavaScript origin: `https://<SITE_DOMAIN>`

It must match exactly, including the scheme and the absence of a trailing
slash. Google takes a few minutes to apply a change.

## 6. Up

```bash
cd /opt/spothub
docker compose pull
docker compose up -d
docker compose logs -f caddy
```

Caddy asks Let's Encrypt for certificates for all three names on the first
request to each. Watch for `certificate obtained successfully`. If it fails,
it is almost always DNS not resolving yet, or port 80 blocked — Let's Encrypt
validates over HTTP before HTTPS exists.

The API runs `prisma migrate deploy` as it starts, so the schema is created on
the first boot. Watch it land:

```bash
docker compose logs api | head -40
```

## 7. Check it is real

In order, because each one proves something the next depends on:

1. `curl -I https://<SITE_DOMAIN>` → `200`, and a valid certificate.
2. `curl https://<SITE_DOMAIN>/robots.txt` → the disallow list, and a
   `Sitemap:` line naming **your domain**, not `localhost` or `client:4000`.
3. `curl https://<SITE_DOMAIN>/sitemap.xml` → valid XML.
4. Open the site. The blog should render before JavaScript runs — check with
   `curl https://<SITE_DOMAIN> | grep -i '<article'` or by viewing source.
5. Sign in with Google. You should come back signed in, not to an error.
6. Create a build, then upload a photo to it. That one action proves the
   presigned PUT, the storage domain's certificate, and the commit step that
   strips EXIF.
7. Open `https://<SITE_DOMAIN>/hangar/<some build id>` and hard-refresh it.
   A 404 here means Caddy is not falling through to the client server.
8. Import a `.bbl` log. That proves `blackbox_decode` is in the API image.

## Releasing a change

Work lands on `dev` and is released by merging it into `master`, through a
pull request as every release so far has been. A fast-forward is not an
option and never was: `master` carries a merge commit per past release, so
it is not an ancestor of `dev`.

Open the pull request from `dev` into `master` and merge it once CI is
green. Then wait for CI to go green on `master` too — that run is what
publishes the `master` image — and on the server:

```bash
cd /opt/spothub
docker compose pull
docker compose up -d
```

Migrations run as the API starts. `docker compose up -d` only restarts what
actually changed.

## Rolling back

`master` is a moving tag; `sha-<commit>` is not. Set `SPOTHUB_TAG` in `.env`
to the long sha tag of a commit that worked and bring it up again:

```bash
sed -i 's/^SPOTHUB_TAG=.*/SPOTHUB_TAG=sha-<the full commit sha>/' .env
docker compose up -d
```

**A rollback does not undo a migration.** Prisma has no down-migrations here
by design, so rolling the code back across a schema change needs a restore
from a dump, which is the next ticket.

## When something is wrong

```bash
docker compose ps                  # who is up, who is restarting
docker compose logs -f api         # or client, caddy, postgres
docker stats --no-stream           # what is eating the 4 GB
```

Failures that are worth recognising on sight:

| What you see                            | What it is                                                            |
| --------------------------------------- | --------------------------------------------------------------------- |
| Every page answers `400`                | `NG_ALLOWED_HOSTS` does not match the Host header Caddy sends         |
| Canonical links say `client:4000`       | `NG_TRUST_PROXY_HEADERS` is missing, so the forwarded host is ignored |
| Sign-in returns `redirect_uri_mismatch` | The Google console URI is not character-for-character the same        |
| Signed in, but signed out on refresh    | The refresh cookie is `secure`; the site must be HTTPS end to end     |
| Photo upload fails at the PUT           | `storage.<domain>` has no certificate, or `S3_ENDPOINT` is internal   |
| API restarts in a loop                  | Usually the database URL, visible in the first lines of its log       |

## What this deliberately does not do yet

- **No backups.** That is the next ticket, and it should land before any real
  logbook data does.
- **No deploy automation.** A pull and a restart by hand is honest at one
  deploy a week; a GitHub Actions job over SSH can come later.
- **No HSTS.** Added once the site has run on HTTPS long enough to trust it —
  it is hard to undo.
- **No monitoring.** `docker compose ps` and the site itself, for now.
