import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { OAuthService } from "../auth/oauth-service.js";
import type { ServerProjectService } from "../runner/project-service.js";

export interface OAuthRoutesOptions {
  oauthService: OAuthService;
  projectService?: ServerProjectService;
}

export const oauthRoutes: FastifyPluginAsync<OAuthRoutesOptions> = async (
  fastify,
  options
) => {
  const { oauthService, projectService } = options;

  if (!fastify.hasContentTypeParser("application/x-www-form-urlencoded")) {
    fastify.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_req, body: string, done) => {
        try {
          const params = new URLSearchParams(body);
          const result: Record<string, any> = {};
          for (const [key, value] of params.entries()) {
            if (result[key]) {
              if (Array.isArray(result[key])) {
                result[key].push(value);
              } else {
                result[key] = [result[key], value];
              }
            } else {
              result[key] = value;
            }
          }
          done(null, result);
        } catch (err: any) {
          done(err, undefined);
        }
      }
    );
  }

  function getOrigin(request: FastifyRequest): string {
    const host = request.headers.host || "localhost:18080";
    const proto =
      (request.headers["x-forwarded-proto"] as string) ||
      (host.includes("localbridge.dev") || host.includes("trycloudflare.com")
        ? "https"
        : "http");
    return `${proto}://${host}`;
  }

  // 1. RFC 9207 OAuth 2.0 Protected Resource Metadata
  fastify.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    const origin = getOrigin(request);
    return reply.status(200).send({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: ["read", "write", "execute"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://github.com/ysunyang979-sys/LocalBridge",
    });
  });

  // 2. RFC 8414 OAuth 2.0 Authorization Server Metadata
  fastify.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    const origin = getOrigin(request);
    return reply.status(200).send({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["read", "write", "execute"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    });
  });

  // 3. GET /oauth/authorize - Consent page
  fastify.get(
    "/oauth/authorize",
    async (
      request: FastifyRequest<{
        Querystring: {
          client_id?: string;
          redirect_uri?: string;
          response_type?: string;
          scope?: string;
          state?: string;
          code_challenge?: string;
          code_challenge_method?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const q = request.query;
      const clientId = q.client_id || "conn_kimi_web";
      const redirectUri = q.redirect_uri || "";
      const state = q.state || "";
      const codeChallenge = q.code_challenge || "";
      const codeChallengeMethod = q.code_challenge_method || "S256";

      if (!redirectUri || !oauthService.isValidRedirectUri(redirectUri)) {
        return reply
          .status(400)
          .send({ error: "invalid_request", error_description: "Invalid redirect_uri" });
      }

      const clientDisplayName =
        clientId === "conn_kimi_web" ? "Kimi Web" : clientId;

      let projectNames: string[] = [];
      try {
        if (projectService) {
          const list = projectService.listProjects();
          projectNames = list.map((p) => p.name);
        }
      } catch {}

      const projectListHtml =
        projectNames.length > 0
          ? projectNames
              .map(
                (p) =>
                  `<li style="margin: 4px 0; font-weight: 500; color: #0284c7;">📁 ${p}</li>`
              )
              .join("")
          : `<li style="color: #64748b; font-style: italic;">暂无已授权项目</li>`;

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus 客户端授权</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #F4F7FB;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #D7DFEA;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      max-width: 440px;
      width: 100%;
      padding: 24px;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      border-bottom: 1px solid #D7DFEA;
      padding-bottom: 16px;
    }
    .logo {
      width: 36px;
      height: 36px;
      background: #0284C7;
      color: white;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
    }
    h1 {
      font-size: 17px;
      margin: 0;
      font-weight: 800;
    }
    p.desc {
      font-size: 13px;
      color: #475569;
      margin: 4px 0 0 0;
    }
    .section {
      margin: 16px 0;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .scopes {
      background: #F8FAFC;
      border: 1px solid #D7DFEA;
      border-radius: 10px;
      padding: 12px;
    }
    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 13px;
    }
    .scope-item:last-child {
      margin-bottom: 0;
    }
    .scope-desc {
      font-size: 11px;
      color: #64748B;
      margin-top: 2px;
    }
    .projects-box {
      background: #F8FAFC;
      border: 1px solid #D7DFEA;
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      max-height: 100px;
      overflow-y: auto;
    }
    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 24px;
    }
    button {
      flex: 1;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-allow {
      background: #0284C7;
      color: white;
    }
    .btn-allow:hover {
      background: #0369A1;
    }
    .btn-deny {
      background: #F1F5F9;
      color: #475569;
      border: 1px solid #D7DFEA;
    }
    .btn-deny:hover {
      background: #E2E8F0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">N</div>
      <div>
        <h1>Nexus 授权请求</h1>
        <p class="desc"><strong>${clientDisplayName}</strong> 请求访问您的本地 Nexus 控制面</p>
      </div>
    </div>

    <form method="POST" action="/oauth/approve">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="code_challenge" value="${codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">

      <div class="section">
        <div class="section-title">请求权限范围</div>
        <div class="scopes">
          <div class="scope-item">
            <input type="checkbox" name="scope" value="read" id="sc_read" checked>
            <div>
              <label for="sc_read"><strong>读取权限 (Read)</strong></label>
              <div class="scope-desc">读取已授权项目文件、Git 状态与代码智能信息。</div>
            </div>
          </div>
          <div class="scope-item">
            <input type="checkbox" name="scope" value="write" id="sc_write" checked>
            <div>
              <label for="sc_write"><strong>写入权限 (Write)</strong></label>
              <div class="scope-desc">在已授权项目中创建、修改或修补文件（受策略保护）。</div>
            </div>
          </div>
          <div class="scope-item">
            <input type="checkbox" name="scope" value="execute" id="sc_exec">
            <div>
              <label for="sc_exec"><strong>执行权限 (Execute)</strong></label>
              <div class="scope-desc">执行安全命令与测试运行（默认关闭，高危写操作仍受审批弹窗控制）。</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">当前已授权项目范围</div>
        <div class="projects-box">
          <ul style="margin: 0; padding-left: 18px;">
            ${projectListHtml}
          </ul>
        </div>
      </div>

      <div class="btn-group">
        <button type="button" class="btn-deny" onclick="handleDeny()">拒绝</button>
        <button type="submit" name="action" value="allow" class="btn-allow">允许授权</button>
      </div>
    </form>
  </div>

  <script>
    function handleDeny() {
      const redirectUri = "${redirectUri}";
      const state = "${state}";
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "User denied authorization request");
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
    }
  </script>
</body>
</html>`;

      reply.type("text/html; charset=utf-8").send(html);
    }
  );

  // 4. POST /oauth/approve - Form submission from consent page
  fastify.post(
    "/oauth/approve",
    async (
      request: FastifyRequest<{
        Body: {
          client_id?: string;
          redirect_uri?: string;
          state?: string;
          code_challenge?: string;
          code_challenge_method?: string;
          scope?: string | string[];
          action?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const b = (request.body as any) || {};
      const redirectUri = b.redirect_uri;
      const state = b.state || "";

      if (!redirectUri || !oauthService.isValidRedirectUri(redirectUri)) {
        return reply.status(400).send({ error: "invalid_request", error_description: "Invalid redirect_uri" });
      }

      if (b.action !== "allow") {
        const url = new URL(redirectUri);
        url.searchParams.set("error", "access_denied");
        if (state) url.searchParams.set("state", state);
        return reply.redirect(url.toString(), 302);
      }

      let scopes: string[] = [];
      if (Array.isArray(b.scope)) {
        scopes = b.scope;
      } else if (typeof b.scope === "string") {
        scopes = [b.scope];
      } else {
        scopes = ["read", "write"];
      }

      try {
        const code = oauthService.issueAuthorizationCode({
          clientId: b.client_id || "conn_kimi_web",
          redirectUri,
          responseType: "code",
          scopes,
          state,
          codeChallenge: b.code_challenge || "",
          codeChallengeMethod: "S256",
        });

        const url = new URL(redirectUri);
        url.searchParams.set("code", code);
        if (state) url.searchParams.set("state", state);
        return reply.redirect(url.toString(), 302);
      } catch (err: any) {
        const url = new URL(redirectUri);
        url.searchParams.set("error", "server_error");
        url.searchParams.set("error_description", err?.message || String(err));
        if (state) url.searchParams.set("state", state);
        return reply.redirect(url.toString(), 302);
      }
    }
  );

  // 5. POST /oauth/token - Token exchange
  fastify.post(
    "/oauth/token",
    async (
      request: FastifyRequest<{
        Body: {
          grant_type?: string;
          client_id?: string;
          code?: string;
          code_verifier?: string;
          redirect_uri?: string;
          refresh_token?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const b = (request.body as any) || {};
      const grantType = b.grant_type;

      if (!grantType) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description: "Missing grant_type",
        });
      }

      try {
        const tokenResult = oauthService.exchangeToken({
          grantType: grantType as any,
          clientId: b.client_id,
          code: b.code,
          codeVerifier: b.code_verifier,
          redirectUri: b.redirect_uri,
          refreshToken: b.refresh_token,
        });

        return reply
          .status(200)
          .header("Cache-Control", "no-store")
          .header("Pragma", "no-cache")
          .send(tokenResult);
      } catch (err: any) {
        return reply.status(400).send({
          error: "invalid_grant",
          error_description: err?.message || String(err),
        });
      }
    }
  );

  // 6. POST /oauth/revoke - Revoke token
  fastify.post(
    "/oauth/revoke",
    async (
      request: FastifyRequest<{
        Body: {
          token?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const b = (request.body as any) || {};
      if (b.token) {
        oauthService.revokeToken(b.token);
      }
      return reply.status(200).send({ success: true });
    }
  );
};
