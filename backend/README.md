# Nexus backend changes

The plugin uses the Xodus Nexus sign-in and CLI. This patch adds device and joinable-party presence, party privacy modes, a relay fallback, and party text permission checks to the Nexus backend.

Use the backend source at commit `f51b5fd4bf01b141ca8a6fb0f3187b89bec6b523` from [nexus-backend](https://github.com/dante2130/nexus-backend). Apply `nexus-social.patch` from the root of that checkout, then build the CLI with Rust 1.98 and the backend's documented system dependencies.

```sh
cargo build --locked -p xodus-cli --no-default-features
```

Use the plugin packager's `--backend` and `--backend-source` options to bundle the resulting CLI and corresponding source.
