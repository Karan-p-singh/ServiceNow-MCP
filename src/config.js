const DEFAULTS = {
  edition: "dev",
  instanceUrl: "https://example.service-now.com",
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

export function loadConfig(env = process.env) {
  return {
    edition: env.MCP_EDITION || DEFAULTS.edition,
    instanceUrl: env.SN_INSTANCE_URL || DEFAULTS.instanceUrl,
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
