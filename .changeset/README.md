# Releases

Run `pnpm changeset`, select `@maquest/desktop`, choose a bump, and describe the change. Include that file with the change. On `main`, CI consumes pending changesets, commits the version and changelog, builds Windows x64 and Linux x64 downloads, and publishes a GitHub release only after both builds succeed. No npm packages are published.

Use the Release workflow’s manual dispatch to retry a failed release. Versions already published are skipped.
