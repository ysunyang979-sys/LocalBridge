import crypto from "node:crypto";
import type { TokenService } from "../db/token-service.js";

export interface AuthorizationCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface OAuthSessionRecord {
  sessionId: string;
  clientId: string;
  accessToken: string;
  tokenId: string; // id in TokenService
  refreshToken: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface OAuthAuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

export interface OAuthTokenParams {
  grantType: "authorization_code" | "refresh_token";
  clientId?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  refreshToken?: string;
}

export class OAuthService {
  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly sessions = new Map<string, OAuthSessionRecord>();
  private readonly refreshTokenToSessionId = new Map<string, string>();

  constructor(private readonly tokenService: TokenService) {}

  /**
   * Validates redirect URI: must be an HTTPS URL, localhost, or standard app deep link.
   */
  public isValidRedirectUri(uri: string): boolean {
    if (!uri || typeof uri !== "string") return false;
    try {
      const parsed = new URL(uri);
      if (parsed.protocol === "javascript:" || parsed.protocol === "data:") {
        return false;
      }
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        return true;
      }
      if (parsed.protocol === "https:") {
        const host = parsed.hostname.toLowerCase();
        if (
          host === "moonshot.cn" ||
          host.endsWith(".moonshot.cn") ||
          host === "kimi.com" ||
          host.endsWith(".kimi.com") ||
          host === "kimi.ai" ||
          host.endsWith(".kimi.ai") ||
          host.endsWith(".localbridge.dev")
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Issues a short-lived authorization code following RFC 7636 (PKCE).
   */
  public issueAuthorizationCode(params: OAuthAuthorizeParams): string {
    if (params.responseType !== "code") {
      throw new Error("Unsupported response_type. Expected 'code'.");
    }
    if (!params.codeChallenge || params.codeChallengeMethod !== "S256") {
      throw new Error("PKCE required with code_challenge_method=S256.");
    }
    if (!this.isValidRedirectUri(params.redirectUri)) {
      throw new Error(`Invalid or insecure redirect_uri: ${params.redirectUri}`);
    }

    const code = `nx_code_${crypto.randomBytes(24).toString("hex")}`;
    const now = Date.now();
    const record: AuthorizationCodeRecord = {
      code,
      clientId: params.clientId || "conn_kimi_web",
      redirectUri: params.redirectUri,
      scopes: params.scopes.length > 0 ? params.scopes : ["read", "write"],
      state: params.state,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // 5 minutes
      used: false,
    };

    this.codes.set(code, record);
    return code;
  }

  /**
   * Exchanges an authorization code or refresh token for an access token.
   */
  public exchangeToken(params: OAuthTokenParams): {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    refresh_token: string;
    scope: string;
  } {
    if (params.grantType === "authorization_code") {
      if (!params.code) {
        throw new Error("Missing authorization code");
      }
      const record = this.codes.get(params.code);
      if (!record) {
        throw new Error("Invalid or unknown authorization code");
      }
      if (record.used) {
        throw new Error("Authorization code has already been used");
      }
      if (Date.now() > record.expiresAt) {
        this.codes.delete(params.code);
        throw new Error("Authorization code has expired");
      }
      if (params.redirectUri && params.redirectUri !== record.redirectUri) {
        throw new Error("redirect_uri mismatch");
      }

      // PKCE verification
      if (!params.codeVerifier) {
        throw new Error("Missing PKCE code_verifier");
      }
      const hash = crypto.createHash("sha256").update(params.codeVerifier).digest();
      const computedChallenge = hash
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      if (computedChallenge !== record.codeChallenge) {
        throw new Error("PKCE verification failed: code_verifier does not match code_challenge");
      }

      // Mark code as used immediately
      record.used = true;
      this.codes.delete(params.code);

      // Create an MCP token inside TokenService so /mcp recognizes it directly
      const clientName =
        record.clientId === "conn_kimi_web" ? "Kimi Web" : record.clientId;
      const createdToken = this.tokenService.createToken({
        name: `AI Client: ${clientName} (OAuth)`,
        type: "mcp",
        scopes: record.scopes,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      const refreshToken = `nx_rt_${crypto.randomBytes(32).toString("hex")}`;
      const sessionId = `session_${crypto.randomUUID()}`;

      const session: OAuthSessionRecord = {
        sessionId,
        clientId: record.clientId,
        accessToken: createdToken.token,
        tokenId: createdToken.id,
        refreshToken,
        scopes: record.scopes,
        createdAt: Date.now(),
        expiresAt: createdToken.expiresAt!,
        revokedAt: null,
      };

      this.sessions.set(sessionId, session);
      this.refreshTokenToSessionId.set(refreshToken, sessionId);

      return {
        access_token: createdToken.token,
        token_type: "Bearer",
        expires_in: 86400,
        refresh_token: refreshToken,
        scope: record.scopes.join(" "),
      };
    }

    if (params.grantType === "refresh_token") {
      if (!params.refreshToken) {
        throw new Error("Missing refresh_token");
      }
      const sessionId = this.refreshTokenToSessionId.get(params.refreshToken);
      if (!sessionId) {
        throw new Error("Invalid refresh token");
      }
      const session = this.sessions.get(sessionId);
      if (!session || session.revokedAt) {
        throw new Error("Refresh token has been revoked or expired");
      }

      // Invalidate previous access token
      try {
        this.tokenService.revokeToken(session.tokenId);
      } catch {}

      // Generate new token
      const clientName =
        session.clientId === "conn_kimi_web" ? "Kimi Web" : session.clientId;
      const createdToken = this.tokenService.createToken({
        name: `AI Client: ${clientName} (OAuth Refreshed)`,
        type: "mcp",
        scopes: session.scopes,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });

      // Rotate refresh token
      this.refreshTokenToSessionId.delete(params.refreshToken);
      const newRefreshToken = `nx_rt_${crypto.randomBytes(32).toString("hex")}`;
      this.refreshTokenToSessionId.set(newRefreshToken, sessionId);

      session.accessToken = createdToken.token;
      session.tokenId = createdToken.id;
      session.refreshToken = newRefreshToken;
      session.expiresAt = createdToken.expiresAt!;

      return {
        access_token: createdToken.token,
        token_type: "Bearer",
        expires_in: 86400,
        refresh_token: newRefreshToken,
        scope: session.scopes.join(" "),
      };
    }

    throw new Error(`Unsupported grant_type: ${(params as any).grantType}`);
  }

  /**
   * Revokes an OAuth token or refresh token.
   */
  public revokeToken(tokenString: string): boolean {
    if (!tokenString) return false;

    // Check if it's a refresh token
    const sessionId = this.refreshTokenToSessionId.get(tokenString);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.revokedAt = Date.now();
        try {
          this.tokenService.revokeToken(session.tokenId);
        } catch {}
        this.refreshTokenToSessionId.delete(tokenString);
        return true;
      }
    }

    // Check if it's an access token across active sessions
    for (const session of this.sessions.values()) {
      if (session.accessToken === tokenString) {
        session.revokedAt = Date.now();
        try {
          this.tokenService.revokeToken(session.tokenId);
        } catch {}
        this.refreshTokenToSessionId.delete(session.refreshToken);
        return true;
      }
    }

    return false;
  }
}
