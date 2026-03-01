const DEFAULTS = {
  edition: "dev",
  transport: "http-sse",
  serverHost: "localhost",
  serverPort: 3001,
  serverPath: "/mcp",
  instanceUrl: "https://example.service-now.com",
  instanceKey: "default",
  authMode: "oauth",
  retryMaxAttempts: 3,
  retryBaseDelayMs: 200,
  requestTimeoutMs: 4000,
  tierMax: "T0",
  allowedScopes: ["global"],
  denyGlobalWrites: false,
  enforceChangesetScope: false,
  changesetScope: "",
  breakGlassEnabled: false,
  exceptionAllowlist: [],
};

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseCsv(value, defaultValue = []) {
  if (!value) {
    return defaultValue;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseInstances(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const instances = {};
    for (const [instanceKey, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const auth = {
        mode: entry.auth?.mode || DEFAULTS.authMode,
        clientId: entry.auth?.clientId || "",
        clientSecret: entry.auth?.clientSecret || "",
        accessToken: entry.auth?.accessToken || "",
        username: entry.auth?.username || "",
        password: entry.auth?.password || "",
      };

      instances[instanceKey] = {
        key: instanceKey,
        instanceUrl: entry.instanceUrl || DEFAULTS.instanceUrl,
        auth,
      };
    }

    return Object.keys(instances).length > 0 ? instances : null;
  } catch {
    return null;
  }
}

function buildDefaultInstance(env) {
  return {
    key: env.SN_INSTANCE_KEY || DEFAULTS.instanceKey,
    instanceUrl: env.SN_INSTANCE_URL || DEFAULTS.instanceUrl,
    auth: {
      mode: env.SN_AUTH_MODE || DEFAULTS.authMode,
      clientId: env.SN_CLIENT_ID || "",
      clientSecret: env.SN_CLIENT_SECRET || "",
      accessToken: env.SN_OAUTH_ACCESS_TOKEN || "",
      username: env.SN_USERNAME || "",
      password: env.SN_PASSWORD || "",
    },
  };
}

function normalizeInstances(env) {
  const parsed = parseInstances(env.SN_INSTANCES_JSON);
  if (parsed) {
    const configuredDefault = env.SN_DEFAULT_INSTANCE || Object.keys(parsed)[0];
    const defaultInstance = parsed[configuredDefault]
      ? configuredDefault
      : Object.keys(parsed)[0];

    return {
      defaultInstance,
      instances: parsed,
    };
  }

  const defaultInstance = buildDefaultInstance(env);
  return {
    defaultInstance: defaultInstance.key,
    instances: {
      [defaultInstance.key]: defaultInstance,
    },
  };
}

export function loadConfig(env = process.env) {
  const instanceConfig = normalizeInstances(env);
  const selectedInstance = instanceConfig.instances[instanceConfig.defaultInstance];

  return {
    edition: env.MCP_EDITION || DEFAULTS.edition,
    transport: env.MCP_TRANSPORT || DEFAULTS.transport,
    server: {
      host: env.MCP_SERVER_HOST || DEFAULTS.serverHost,
      port: parseInteger(env.MCP_SERVER_PORT, DEFAULTS.serverPort),
      path: env.MCP_SERVER_PATH || DEFAULTS.serverPath,
    },
    instanceUrl: selectedInstance?.instanceUrl || DEFAULTS.instanceUrl,
    defaultInstance: instanceConfig.defaultInstance,
    instances: instanceConfig.instances,
    retry: {
      maxAttempts: parseInteger(env.SN_RETRY_MAX_ATTEMPTS, DEFAULTS.retryMaxAttempts),
      baseDelayMs: parseInteger(env.SN_RETRY_BASE_DELAY_MS, DEFAULTS.retryBaseDelayMs),
      requestTimeoutMs: parseInteger(env.SN_REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
    },
    tierMax: env.MCP_TIER_MAX || DEFAULTS.tierMax,
    allowedScopes: parseCsv(env.MCP_ALLOWED_SCOPES, DEFAULTS.allowedScopes),
    denyGlobalWrites: parseBoolean(env.MCP_DENY_GLOBAL_WRITES, DEFAULTS.denyGlobalWrites),
    enforceChangesetScope: parseBoolean(
      env.MCP_ENFORCE_CHANGESET_SCOPE,
      DEFAULTS.enforceChangesetScope,
    ),
    changesetScope: env.MCP_CHANGESET_SCOPE || DEFAULTS.changesetScope,
    breakGlassEnabled: parseBoolean(
      env.MCP_BREAK_GLASS_ENABLED,
      DEFAULTS.breakGlassEnabled,
    ),
    exceptionAllowlist: parseCsv(env.MCP_EXCEPTION_ALLOWLIST, DEFAULTS.exceptionAllowlist),
  };
}
