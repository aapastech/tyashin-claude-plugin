# Security

Please report vulnerabilities privately to the Tyashin team via https://tyashin.com (contact page) rather than opening a public issue.

What the plugin handles:
- A personal access token for the user's own Tyashin account, stored at `~/.config/tyashin/credentials.json` with mode 0600, never sent anywhere except the Tyashin API and never returned to the model.
- No passwords, payment details or third-party credentials.
