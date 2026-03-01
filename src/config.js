const DEFAULTS = {
  edition: "dev",
  instanceUrl: "https://example.service-now.com",
  tierMax: "T0",
};

export function loadConfig(env = process.env) {
  return {
    edition: env.MCP_EDITION || DEFAULTS.edition,
    instanceUrl: env.SN_INSTANCE_URL || DEFAULTS.instanceUrl,
    tierMax: env.MCP_TIER_MAX || DEFAULTS.tierMax,
  };
}
