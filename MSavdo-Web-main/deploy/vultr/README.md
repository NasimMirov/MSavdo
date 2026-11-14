# Vultr deployment

This deployment runs the M.Savdo API on Vultr. The storefront remains on Vercel, and `api.msavdo.shop` remains the API hostname. This configuration does not provision an instance, change DNS, or transfer production data.

## Budget instance

The Vultr account's Shared CPU selector currently lists:

- **$2.50/month:** 1 vCPU, 0.5 GB RAM, 10 GB SSD, 0.5 TB bandwidth. The `v6` plan is IPv6-only and is too small for this production API.
- **$5/month:** 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB bandwidth. This is the lowest-priced plan with a practical public IPv4 configuration. With Vultr automatic backups, which add 20% to the instance price, it is about **$6/month before taxes**.
- **$10/month:** 1 vCPU, 2 GB RAM, 55 GB SSD, 2 TB bandwidth. With automatic backups it is about **$12/month before taxes**.

See Vultr's [Regular Performance Cloud Compute pricing](https://www.vultr.com/products/regular-performance-compute/) and [automatic backup pricing](https://docs.vultr.com/support/platform/billing/how-much-does-it-cost-to-enable-automatic-backups); confirm the current total and region in the account before deploying.

The $5 plan is a tight budget compromise, not a guarantee of stable production. Amvera also had 1 GB RAM, and its outage was not proven to be caused by resource limits. The $10 plan provides more headroom for Node.js, SQLite and image processing. The initial migrated data snapshot was 14.3 MB across 113 files; monitor disk usage as the catalog and uploads grow.

Choose a European region with good latency to Tajikistan from the locations actually offered in the Vultr account. Use a supported Ubuntu LTS image and add an SSH public key (never share the private key). Restrict inbound SSH to a trusted IP where possible; allow public TCP ports 80 and 443 for HTTPS. Vultr's [instance provisioning guide](https://docs.vultr.com/products/compute/instances/cloud-compute/provisioning) describes the instance and backup options.

## Required secrets

Create `.env` from `.env.example` on the instance; never commit `.env` or paste secret values into chat. Use a unique `ADMIN_JWT_SECRET` of at least 32 bytes; do not reuse a secret from another host. Configure `TELEGRAM_LOGIN_CLIENT_ID` and exactly two numeric `ADMIN_TELEGRAM_ALLOWED_IDS`.

## Database and uploads

The API stores its SQLite database at `/data/msavdo.db` and uploaded images under `/data/uploads`. Compose bind-mounts `deploy/vultr/data` to `/data`; keep this directory and the downloaded backup private.

Before cutover, obtain a consistent backup containing `msavdo.db` and `uploads/` from Amvera or an existing M.Savdo backup archive. The in-app backup is a ZIP containing those paths. Since the Amvera API is currently unavailable, do not assume the in-app download is reachable. Do not copy only `msavdo.db` from a running SQLite service; the database may also have WAL state. If no consistent backup can be obtained, stop and resolve data access before switching DNS.

On the instance, extract the verified archive so the resulting paths are:

```text
deploy/vultr/data/msavdo.db
deploy/vultr/data/uploads/
```

Do not overwrite an existing data directory without preserving a separate copy. Never run `docker compose down -v`; it deletes named Docker volumes, including Caddy certificate state.

## Normal product and sales workflow

Add and manage products from the storefront's administrator panel. Active products are read from the database, and the sitemap index plus paginated product sitemaps are generated from the active catalog, so adding a product does not require a code deployment or manual sitemap edit. Google controls its own recrawl and indexing schedule.

The Vercel homepage middleware uses `/api/seo/home` to include up to 24 popular active products in the initial HTML; the paginated catalog and sitemaps cover the rest. Deploy the API before deploying frontend changes that use this endpoint. If either the API or the static template cannot be fetched, the middleware logs the error and serves the ordinary storefront instead. The middleware consumes Vercel function usage; monitor the account's plan limits.

Checkout records the order in SQLite before opening the configured WhatsApp conversation. Review and manage orders from the authenticated administrator panel. Gemini suggestions are optional; manual product entry and the built-in semantic import fallback work without a Gemini key.

Vultr Auto Backups are enabled for the production instance. The database and uploads are on the instance's root filesystem; keep a separate, verified application-data archive outside the VPS as well. The migration archives under `/opt/msavdo/backups` are on the VPS and are not an off-site copy.

## Start and verify

From `deploy/vultr`, create `.env`, place the verified data backup in `data/`, then run:

```sh
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 api
```

Wait until `api` is healthy. Caddy obtains and renews the HTTPS certificate after `api.msavdo.shop` resolves to the instance and ports 80/443 are reachable. Verify `/api/ping`, `/sitemap.xml`, and at least one product page over HTTPS before cutover.

At cutover, change the DNS A record for `api.msavdo.shop` to the Vultr public IPv4 address. Remove or update any stale AAAA record unless IPv6 is configured on the instance. The Vercel frontend and its rewrites need no hostname change.

Keep Amvera and its data intact as a rollback source until you deliberately choose to retire it. Vultr automatic backups cover the instance's active filesystem, not attached block storage, and are not a replacement for a private off-server backup of M.Savdo data.
