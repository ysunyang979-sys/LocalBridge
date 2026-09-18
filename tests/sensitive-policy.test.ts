import { describe, it, expect } from "vitest";
import { isSensitiveFile } from "@localbridge/security";

describe("Sensitive File Policy", () => {
  describe("Detects sensitive files", () => {
    const sensitiveCases = [
      ".env",
      ".env.local",
      ".env.development",
      ".env.production",
      ".env.test",
      "apps/api/.env",
      "apps/api/.env.production",
      "id_rsa",
      "id_rsa.pub",
      "id_ed25519",
      "id_ed25519.pub",
      ".ssh/id_rsa",
      "certs/server.pem",
      "certs/ca.pem",
      "ssl/private.key",
      "keys/app.key",
      ".git/config",
      ".git/HEAD",
      ".git/credentials",
      "credentials.json",
      "client_secret.json",
      ".aws/credentials",
      ".aws/config",
      "config/master.key",
    ];

    for (const file of sensitiveCases) {
      it(`identifies "${file}" as sensitive`, () => {
        expect(isSensitiveFile(file)).toBe(true);
      });
    }
  });

  describe("Allows safe business files without false positives", () => {
    const safeCases = [
      "src/index.ts",
      "package.json",
      "README.md",
      "tsconfig.json",
      "pnpm-lock.yaml",
      "src/keyboard.ts", // must not match *.key
      "src/utils/keyboard.js",
      "docs/monkey.pem.txt", // must not match *.pem
      "docs/environment.md", // must not match .env
      "src/services/environment-service.ts",
      "src/keys.ts", // must not match *.key
      "test/pem-parser.test.ts",
      "git-status.ts",
    ];

    for (const file of safeCases) {
      it(`does NOT identify "${file}" as sensitive`, () => {
        expect(isSensitiveFile(file)).toBe(false);
      });
    }
  });
});
