# AGENTS.md
The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Developer Notes


## Agent Notes (Surprises Encountered)

### View, Style, And Vector Asset Separation
- Views should stay focused on markup and Rails helpers. Avoid embedding large `<style>` blocks or inline SVG markup in `.erb` templates.
- Page and layout styling belongs in Rails asset stylesheets under `app/assets/stylesheets/`. The logged-in shell/sidebar styles currently live in `app/assets/stylesheets/logged_in.css`; public landing/auth styles live in `app/assets/stylesheets/public_pages.css`.
- Public static vector assets belong under `public/icons/`. The sidebar icons are stored there as separate SVG files and loaded by the layout instead of being written directly into the view.
- Keep custom interactive behavior in JavaScript assets instead of inline scripts when possible. The split verification-code input behavior lives in `app/assets/javascripts/verification_code.js`.
- The authenticated layout keeps navigation structure in `app/views/layouts/settings.html.erb`, but styling and SVG source are separated into their own asset files.

### Shared-Host Kamal Service Naming
- This repo may be deployed alongside a different Kamal app on the same server. Keep this app's `config/deploy.yml` `service` value distinct from the other app's service name, even if the public domain is related.
- Reusing the other app's service name will collide with Kamal-managed container names, network names, and accessory hostnames. In the current setup, `service: detrix` intentionally serves `m.lattrix.com` while the separate root-domain app uses a different service name.

### WSL SSH Key Paths For Kamal
- When running Kamal from WSL, do not point `ssh.keys` at a private key on `/mnt/c/...`. OpenSSH in WSL can reject mounted Windows key files because their permissions appear too open.
- Use a WSL-local copy such as `/home/<user>/.ssh/<keyname>` and `chmod 600` it before deploying.

### Importmap Files May Need To Be Created
- The app includes `importmap-rails`, but the repo may not have the usual generated files yet, such as `config/importmap.rb` or `bin/importmap`.
- If moving JavaScript into `app/javascript`, create or verify `config/importmap.rb` and load the entrypoint with `javascript_importmap_tags` instead of assuming the importmap installer has already been run.
