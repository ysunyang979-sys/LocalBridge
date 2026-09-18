#!/usr/bin/env node
import { loadConfig } from "@localbridge/shared";
import { initDatabase } from "../db/index.js";
import { TokenService } from "../db/token-service.js";

async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];

  const config = loadConfig();
  const conn = initDatabase(config.server.dbPath);
  const tokenService = new TokenService(conn.db);

  try {
    if (command === "create") {
      const type = (args[1] || "runner") as "mcp" | "runner";
      const name = args[2] || "Default Runner";

      if (type !== "mcp" && type !== "runner") {
        console.error("Error: Token type must be either 'runner' or 'mcp'");
        process.exit(1);
      }

      const result = tokenService.createToken({ name, type });

      console.log(`\n${type === "runner" ? "Runner" : "MCP"} token created.\n`);
      console.log(`ID:\n${result.id}\n`);
      console.log(`Name:\n${result.name}\n`);
      console.log(`Token:\n${result.token}\n`);
      console.log("IMPORTANT:\nThis token will only be shown once. Please store it securely.\n");
    } else if (command === "list") {
      const tokens = tokenService.listTokens();
      if (tokens.length === 0) {
        console.log("No tokens found.");
      } else {
        console.log("\nRegistered Tokens:");
        console.log("--------------------------------------------------------------------------------");
        console.table(
          tokens.map((t) => ({
            ID: t.id,
            Type: t.type,
            Name: t.name,
            Created: new Date(t.createdAt).toISOString(),
            Expires: t.expiresAt ? new Date(t.expiresAt).toISOString() : "Never",
            Revoked: t.revokedAt ? new Date(t.revokedAt).toISOString() : "No",
          }))
        );
      }
    } else if (command === "revoke") {
      const id = args[1];
      if (!id) {
        console.error("Error: Please specify token ID to revoke: token:revoke <id>");
        process.exit(1);
      }

      const revoked = tokenService.revokeToken(id);
      if (revoked) {
        console.log(`Token "${id}" has been revoked.`);
      } else {
        console.log(`Token "${id}" not found or already revoked.`);
      }
    } else {
      console.log("Usage:");
      console.log("  token:create [runner|mcp] [name]");
      console.log("  token:list");
      console.log("  token:revoke <id>");
    }
  } finally {
    conn.close();
  }
}

runCli().catch((err) => {
  console.error("Token CLI Error:", err);
  process.exit(1);
});
