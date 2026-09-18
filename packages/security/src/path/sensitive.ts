/**
 * Checks whether a relative path points to a sensitive credential or secret file.
 *
 * Sensitive categories:
 * - .env and .env.* (e.g. .env.local, .env.production)
 * - *.pem and *.key (private certificates/keys)
 * - id_rsa*, id_ed25519*, id_ecdsa* (SSH private keys)
 * - credentials.json
 * - .aws/credentials
 * - .ssh/*
 *
 * Avoids false positives:
 * - keyboard.ts (contains 'key' in name, but extension is .ts)
 * - monkey.pem.txt (extension is .txt, not .pem)
 * - environment.md (contains 'env' in word, but name is environment)
 */
export function isSensitiveFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  const basename = segments[segments.length - 1]!;

  // 1. .env and .env.*
  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }

  // 2. *.pem and *.key (extension check only)
  if (basename.endsWith(".pem") || basename.endsWith(".key")) {
    return true;
  }

  // 3. SSH private keys: id_rsa, id_ed25519, id_ecdsa
  const sshKeys = ["id_rsa", "id_ed25519", "id_ecdsa"];
  for (const key of sshKeys) {
    if (basename === key || basename.startsWith(`${key}.`)) {
      return true;
    }
  }

  // 4. credentials.json and client_secret*.json
  if (basename === "credentials.json" || basename.startsWith("client_secret")) {
    return true;
  }

  // 5. .aws/* (credentials, config)
  if (segments.includes(".aws")) {
    return true;
  }

  // 6. .ssh/*
  if (segments.includes(".ssh")) {
    return true;
  }

  // 7. .git internal files (.git/config, .git/credentials, etc.)
  if (segments.includes(".git")) {
    return true;
  }

  return false;
}
