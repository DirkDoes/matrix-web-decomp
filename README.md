# Detrix

## Kamal deployment setup

1. Generate Rails credentials if `config/master.key` does not exist yet:
   `bin/rails credentials:edit`
2. Point the `m` DNS record at your Hetzner server.
   - In Namecheap, create an `A` record for `m` to `178.104.77.220`.
   - Do not create a wildcard `*` record if you only want specific subdomains to resolve.
3. Review [`config/deploy.yml`](config/deploy.yml).
   - This repo is configured for `m.lattrix.com`.
   - The Kamal `service` is intentionally `detrix` so it does not collide with the separate app already using `lattrix.com` on the same server.
   - Update `image` if you want to push to a different Docker Hub repository than `wanttobeeme/detrix`.
   - If you run Kamal from WSL, keep `ssh.keys` on a Linux path such as `/home/roose/.ssh/hetzner_ssh`. Do not point WSL SSH at `/mnt/c/...` for the private key because OpenSSH will reject the permissions.
   - If you run Kamal from Windows instead of WSL, change `ssh.keys` to the Windows path form.
4. Copy `.kamal/secrets.example` to `.kamal/secrets`.
5. Add the Rails master key from `config/master.key` to `.kamal/secrets` as `RAILS_MASTER_KEY`.
6. Generate a PostgreSQL password and place it in `.kamal/secrets` as `POSTGRES_PASSWORD`.
   You can generate one with `ruby -rsecurerandom -e "puts SecureRandom.hex(24)"` or `openssl rand -hex 24`.
7. Fill the required secrets in `.kamal/secrets`:
   - `KAMAL_REGISTRY_PASSWORD`
   - `DATABASE_URL`
   - `CACHE_DATABASE_URL`
   - `QUEUE_DATABASE_URL`
   - `CABLE_DATABASE_URL`
8. Fill the optional secrets in `.kamal/secrets` when you use those features:
   - `SMTP_USERNAME`
   - `SMTP_PASSWORD`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
9. Confirm the non-secret runtime values in [`config/deploy.yml`](config/deploy.yml):
   - `proxy.hosts: ["m.lattrix.com"]`
   - `env.clear.APP_HOST: "m.lattrix.com"`
   - `env.clear.APP_PROTOCOL: "https"`
   - `env.clear.MAILER_FROM: "noreply@lattrix.com"`
   - `env.clear.SMTP_ADDRESS: "smtp.gmail.com"` or your provider host
   - `env.clear.SMTP_PORT: "587"`
10. Deploy with `bin/kamal setup` on the first run, then `bin/kamal deploy` for updates.

If you are deploying from WSL and your private key currently lives at `C:\Users\roose\.ssh\hetzner_ssh`, copy it into WSL first and lock down the permissions:

```bash
mkdir -p ~/.ssh
cp /mnt/c/Users/roose/.ssh/hetzner_ssh ~/.ssh/hetzner_ssh
chmod 600 ~/.ssh/hetzner_ssh
```

The sample database URLs already match the `detrix` service name, so the accessory hostname is `detrix-db`. If you change `service` in [`config/deploy.yml`](config/deploy.yml), update the database host and database names in `.kamal/secrets` to match.

SMTP credentials and Google OAuth are optional from the application's perspective, but password-reset emails and Google sign-in will not work until those values are configured. `MAILER_FROM`, `SMTP_ADDRESS`, and `SMTP_PORT` are not secrets and are set directly in [`config/deploy.yml`](config/deploy.yml); change them if your mail provider requires different values.
