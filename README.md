# Detrix

## Kamal deployment setup

1. Generate Rails credentials if `config/master.key` does not exist yet:
   `bin/rails credentials:edit`
2. Update [`config/deploy.yml`](config/deploy.yml) with your real deployment values:
   - `image`
   - `servers.web.hosts`
   - `proxy.hosts`
   - `env.clear.APP_HOST`
   - `registry.username`
   - `ssh.user`
   - `ssh.keys`
3. Copy `.kamal/secrets.example` to `.kamal/secrets`.
4. Add the Rails master key from `config/master.key` to `.kamal/secrets` as `RAILS_MASTER_KEY`.
5. Generate a PostgreSQL password and place it in `.kamal/secrets` as `POSTGRES_PASSWORD`.
   You can generate one with `ruby -rsecurerandom -e "puts SecureRandom.hex(24)"` or `openssl rand -hex 24`.
6. Fill the remaining secret values in `.kamal/secrets`:
   - `KAMAL_REGISTRY_PASSWORD`
   - `DATABASE_URL`
   - `CACHE_DATABASE_URL`
   - `QUEUE_DATABASE_URL`
   - `CABLE_DATABASE_URL`
   - `SMTP_ADDRESS`
   - `SMTP_USERNAME`
   - `SMTP_PASSWORD`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

The sample database URLs already match the Detrix service name. If you change `service` in [`config/deploy.yml`](config/deploy.yml), keep the database host and database names in `.kamal/secrets` aligned with it. The default accessory hostname derived from this setup is `detrix-db`.
