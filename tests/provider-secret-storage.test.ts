import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService, SecureSecretStorage } from "../apps/server/src/db/connection-service.js";

describe("Provider Secret Storage Suite (AES-256-GCM)", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-secret-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("encrypts and decrypts secrets with AES-256-GCM authenticated tags", () => {
    const storage = new SecureSecretStorage();
    const rawKey = "sk-deepseek-live-token-abcdef1234567890";

    const encrypted = storage.encrypt(rawKey);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toContain(rawKey);

    const parts = encrypted.split(":");
    expect(parts.length).toBe(3); // iv:tag:ciphertext
    expect(parts[0].length).toBe(24); // 12-byte IV in hex = 24 chars
    expect(parts[1].length).toBe(32); // 16-byte auth tag in hex = 32 chars

    const decrypted = storage.decrypt(encrypted);
    expect(decrypted).toBe(rawKey);
  });

  it("safely handles corrupted or invalid ciphertext without crashing", () => {
    const storage = new SecureSecretStorage();
    expect(storage.decrypt("invalid-string")).toBe("");
    expect(storage.decrypt("")).toBe("");
    expect(storage.decrypt("1234:5678:invalidhex")).toBe("");
  });

  it("masks API keys properly in UI format", () => {
    const storage = new SecureSecretStorage();
    expect(storage.maskApiKey("sk-1234567890")).toBe("sk-••••••••7890");
    expect(storage.maskApiKey("short")).toBe("••••••••");
    expect(storage.maskApiKey("")).toBe("");
  });

  it("persists encrypted secrets at rest and never exposes plaintext in connection DTOs", () => {
    const rawApiKey = "sk-prod-test-key-998877665544";

    connectionService.createOrUpdateConnection({
      id: "conn_deepseek",
      clientType: "deepseek",
      name: "DeepSeek",
      apiKey: rawApiKey,
    });

    // 1. Direct SQLite row verification - must NOT contain plaintext
    const rawRow = dbConn.db.prepare("SELECT config_json FROM ai_connections WHERE id = 'conn_deepseek'").get() as any;
    expect(rawRow).toBeDefined();
    expect(rawRow.config_json).not.toContain(rawApiKey);
    expect(rawRow.config_json).toContain("apiKeyEncrypted");
    expect(rawRow.config_json).toContain("apiKeyMasked");

    // 2. Client DTO verification - must only have masked key
    const dto = connectionService.getConnection("conn_deepseek");
    expect(dto).toBeDefined();
    expect(dto?.metadata?.apiKeyMasked).toBe("sk-••••••••5544");
    expect((dto as any)?.apiKey).toBeUndefined();

    // 3. Internal server decrypted config - allows tool execution
    const decrypted = connectionService.getDecryptedConfig("conn_deepseek");
    expect(decrypted).toBeDefined();
    expect(decrypted?.apiKey).toBe(rawApiKey);
    expect(decrypted?.apiKeyEncrypted).toBeUndefined();
  });
});
