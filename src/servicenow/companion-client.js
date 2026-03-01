function parseSemver(version) {
  const parts = String(version || "")
    .trim()
    .split(".")
    .map((entry) => Number.parseInt(entry, 10));

  if (parts.length < 3) {
    while (parts.length < 3) {
      parts.push(0);
    }
  }

  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  return parts.slice(0, 3);
}

export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    return null;
  }

  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }

  return 0;
}

function mapCompanionErrorCode(errorCode) {
  if (errorCode === "SN_AUTH_FORBIDDEN") return "COMPANION_FORBIDDEN";
  if (errorCode === "SN_RESOURCE_NOT_FOUND") return "COMPANION_NOT_INSTALLED";
  if (errorCode === "SN_AUTH_UNAUTHORIZED") return "COMPANION_UNAUTHORIZED";
  return "COMPANION_UNREACHABLE";
}

function toCompanionStatusFromError(error) {
  const code = mapCompanionErrorCode(error?.code);
  return {
    enabled: true,
    status: "unavailable",
    ready: false,
    compatible: false,
    version: null,
    min_version: null,
    degraded_reason_code: code,
    source_error: {
      code: error?.code || "UNKNOWN",
      message: error?.message || "Unknown companion error",
    },
  };
}

function unwrapCompanionPayload(data) {
  const root = data?.result ?? data ?? {};
  if (root && typeof root === "object" && root.result && typeof root.result === "object") {
    return root.result;
  }
  return root;
}

export class CompanionClient {
  constructor({ serviceNowClient, config } = {}) {
    this.serviceNowClient = serviceNowClient;
    this.config = config || {};
    this.discoveredBasePath = null;
  }

  resolveCompanionConfig() {
    const rawMode = String(this.config?.companion?.mode || "none").toLowerCase();
    const mode = ["none", "scoped", "global"].includes(rawMode) ? rawMode : "none";
    const explicitEnabled = Boolean(this.config?.companion?.enabled);
    const enabled = explicitEnabled && mode !== "none";
    const configuredBasePath =
      mode === "global"
        ? this.config?.companion?.globalBasePath || "/api/global/x_mcp_companion/v1"
        : this.config?.companion?.basePath || "/api/x_mcp_companion/v1";

    return {
      enabled,
      mode,
      basePath: configuredBasePath,
      minVersion: this.config?.companion?.minVersion || "1.0.0",
      requestTimeoutMs: Number(this.config?.companion?.requestTimeoutMs || 3000),
    };
  }

  async resolveBasePath({ instanceKey } = {}) {
    const companionConfig = this.resolveCompanionConfig();
    if (this.discoveredBasePath) {
      return this.discoveredBasePath;
    }

    if (companionConfig.mode === "global") {
      this.discoveredBasePath = companionConfig.basePath;
      return this.discoveredBasePath;
    }

    try {
      const definitions = await this.serviceNowClient.listTable({
        table: "sys_ws_definition",
        query: "name=x_mcp_companion",
        limit: 1,
        offset: 0,
        instanceKey,
      });
      const discovered = definitions?.records?.[0]?.base_uri;
      if (discovered) {
        this.discoveredBasePath = discovered;
        return discovered;
      }
    } catch {
      // Ignore discovery issues and fall back to configured base path.
    }

    this.discoveredBasePath = companionConfig.basePath;
    return this.discoveredBasePath;
  }

  async getHealth({ instanceKey } = {}) {
    const basePath = await this.resolveBasePath({ instanceKey });
    return this.serviceNowClient.request({
      method: "GET",
      path: `${basePath}/health`,
      instanceKey,
      headers: {
        "X-MCP-Companion-Probe": "health",
      },
    });
  }

  async getStatus({ instanceKey } = {}) {
    const companionConfig = this.resolveCompanionConfig();
    if (!companionConfig.enabled) {
      return {
        enabled: false,
        status: "disabled",
        ready: false,
        compatible: false,
        version: null,
        min_version: companionConfig.minVersion,
        mode: companionConfig.mode,
        degraded_reason_code: "COMPANION_DISABLED_BY_CONFIG",
      };
    }

    try {
      const response = await this.getHealth({ instanceKey });
      const payload = unwrapCompanionPayload(response?.data);
      const installedVersion = payload.version || payload.companion_version || null;
      const versionComparison = compareSemver(installedVersion, companionConfig.minVersion);
      const compatible = versionComparison !== null && versionComparison >= 0;
      const outdated = !compatible;

      return {
        enabled: true,
        status: outdated ? "outdated" : "available",
        ready: !outdated,
        compatible: !outdated,
        version: installedVersion,
        min_version: companionConfig.minVersion,
        mode: companionConfig.mode,
        app_scope: payload.app_scope || "x_mcp_companion",
        degraded_reason_code: outdated ? "COMPANION_OUTDATED" : null,
      };
    } catch (error) {
      const unavailable = toCompanionStatusFromError(error);
      return {
        ...unavailable,
        mode: companionConfig.mode,
        min_version: companionConfig.minVersion,
      };
    }
  }

  async evaluateAcl({ instanceKey, input } = {}) {
    const basePath = await this.resolveBasePath({ instanceKey });
    const response = await this.serviceNowClient.request({
      method: "POST",
      path: `${basePath}/acl/evaluate`,
      instanceKey,
      body: {
        user: input?.user || null,
        table: input?.table || null,
        sys_id: input?.sys_id || null,
        operation: input?.operation || "read",
        field: input?.field || null,
        context: input?.context || {},
      },
      headers: {
        "X-MCP-Companion-Probe": "acl-evaluate",
      },
    });

    const payload = unwrapCompanionPayload(response?.data);
    const decisionRaw = String(payload.decision || payload.outcome || "indeterminate").toLowerCase();
    const decision = ["allow", "deny", "indeterminate"].includes(decisionRaw)
      ? decisionRaw
      : "indeterminate";

    return {
      mode: "authoritative",
      decision,
      confidence: "high",
      limitations: [],
      evaluated_acls: Array.isArray(payload.evaluated_acls) ? payload.evaluated_acls : [],
      reasoning_summary:
        payload.reasoning_summary ||
        payload.message ||
        "Companion authoritative ACL evaluation completed.",
      raw: payload,
    };
  }
}
