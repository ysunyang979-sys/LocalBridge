/**
 * Absolute security boundaries that MUST NEVER be allowed or bypassed by any
 * trust level, session trust, or human approval.
 *
 * Absolute Deny Categories:
 * - .git internal files and directories (.git/*, .git)
 * - LocalBridge internal configuration / token storage (.localbridge/*, .localbridge, localbridge.json)
 */
export function isAbsoluteDenyPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  // 1. .git internal files and directories (.git/config, .git/hooks, etc.)
  if (segments.includes(".git")) {
    return true;
  }

  // 2. LocalBridge runtime and configuration files
  if (
    segments.includes(".localbridge") ||
    segments[segments.length - 1] === "localbridge.json"
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a relative path points to a protected file (credentials, secrets, certificates, .env).
 * Protected files are governed by the project's ProtectedFilesPolicy:
 * - "always-ask" -> Requires human approval (even under Full Project Trust or Session Trust)
 * - "follow-policy" -> Follows the project's active trust policy (auto-allowed under Full Project Trust)
 * - "deny" -> Blocked
 *
 * Protected categories:
 * - .env and .env.* (e.g. .env.local, .env.production, .env.localbridge-test)
 * - *.pem and *.key (private certificates/keys)
 * - id_rsa*, id_ed25519*, id_ecdsa* (SSH private keys)
 * - credentials.json, client_secret*.json
 * - .aws/credentials, .aws/config
 * - .ssh/*
 * - .npmrc, .pypirc, .netrc
 * - *.p12, *.pfx, *.jks, *.keystore
 * - .docker/*
 */
export function isProtectedFile(relativePath: string): boolean {
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

  // 3. SSH private keys: id_rsa*, id_ed25519*, id_ecdsa*
  const sshPrefixes = ["id_rsa", "id_ed25519", "id_ecdsa"];
  for (const prefix of sshPrefixes) {
    if (basename.startsWith(prefix)) {
      return true;
    }
  }

  // 4. credentials* and client_secret*
  if (
    basename.startsWith("credentials") ||
    basename.startsWith("client_secret")
  ) {
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

  // 7. Package manager and network credentials (.npmrc, .pypirc, .netrc)
  if (basename === ".npmrc" || basename === ".pypirc" || basename === ".netrc") {
    return true;
  }

  // 8. Keystore and certificate bundles (*.p12, *.pfx, *.jks, *.keystore)
  if (
    basename.endsWith(".p12") ||
    basename.endsWith(".pfx") ||
    basename.endsWith(".jks") ||
    basename.endsWith(".keystore")
  ) {
    return true;
  }

  // 9. Container secrets (.docker/*)
  if (segments.includes(".docker")) {
    return true;
  }

  return false;
}

export function isSensitiveFile(relativePath: string): boolean {
  return isAbsoluteDenyPath(relativePath) || isProtectedFile(relativePath);
}

/**
 * Checks whether a relative path points to a build definition or CI/CD configuration file.
 * In all approval modes (including "chat" mode), modifying these files MUST require
 * explicit human approval on desktop to prevent automated supply-chain / code injection attacks.
 *
 * Categories:
 * - package.json and lockfiles (package.json, pnpm-lock.yaml, yarn.lock, package-lock.json)
 * - Makefile, GNUmakefile, Makefile.am, Makefile.in, *.mk
 * - .husky/ Git hook definitions
 * - CI/CD pipeline configurations (.github/workflows/*, .gitlab-ci.yml, .circleci/*, azure-pipelines.yml, Jenkinsfile, bitbucket-pipelines.yml)
 * - Build tool manifests: CMakeLists.txt, pom.xml, build.gradle, settings.gradle, Cargo.toml
 */
export function isBuildDefinitionFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  const basename = segments[segments.length - 1]!;

  // 1. package.json and lockfiles
  if (
    basename === "package.json" ||
    basename === "package-lock.json" ||
    basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock"
  ) {
    return true;
  }

  // 2. Makefile variants
  if (
    basename === "makefile" ||
    basename === "gnumakefile" ||
    basename === "makefile.am" ||
    basename === "makefile.in" ||
    basename.endsWith(".mk")
  ) {
    return true;
  }

  // 3. .husky Git hooks
  if (segments.includes(".husky")) {
    return true;
  }

  // 4. CI/CD configurations (.github, .circleci, gitlab, jenkins, etc.)
  if (segments.includes(".github") || segments.includes(".circleci")) {
    return true;
  }
  if (
    basename === ".gitlab-ci.yml" ||
    basename === ".travis.yml" ||
    basename === "azure-pipelines.yml" ||
    basename === "jenkinsfile" ||
    basename === "bitbucket-pipelines.yml"
  ) {
    return true;
  }

  // 5. Build tool manifests
  if (
    basename === "cmakelists.txt" ||
    basename === "pom.xml" ||
    basename === "build.gradle" ||
    basename === "build.gradle.kts" ||
    basename === "settings.gradle" ||
    basename === "settings.gradle.kts" ||
    basename === "cargo.toml" ||
    basename === "cargo.lock"
  ) {
    return true;
  }

  return false;
}
