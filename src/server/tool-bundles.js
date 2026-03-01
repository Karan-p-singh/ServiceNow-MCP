const PROFILE_BUNDLES = {
  dev_full: ["dev_core", "dev_validation", "dev_changesets", "dev_commit"],
  dev_safe: ["dev_core", "dev_validation", "dev_changesets"],
  prod_readonly: ["dev_core", "dev_validation", "dev_changesets"],
  commit_only: ["dev_core", "dev_changesets", "dev_commit"],
};

const TOOL_TO_BUNDLE = [
  { exact: "sn.changeset.commit", bundle: "dev_commit" },
  { exact: "sn.rollback.plan.generate", bundle: "dev_changesets" },
  { exact: "sn.instance.info", bundle: "dev_core" },
  { exact: "sn.table.list", bundle: "dev_core" },
  { exact: "sn.acl.trace", bundle: "dev_core" },
  { prefix: "sn.validate.", bundle: "dev_validation" },
  { prefix: "sn.script.", bundle: "dev_validation" },
  { prefix: "sn.flow.", bundle: "dev_validation" },
  { prefix: "sn.workflow.", bundle: "dev_validation" },
  { prefix: "sn.changeset.", bundle: "dev_changesets" },
  { prefix: "sn.updateset.", bundle: "dev_changesets" },
];

function parseCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function inferBundleForTool(toolName) {
  const name = String(toolName || "").trim();
  for (const mapping of TOOL_TO_BUNDLE) {
    if (mapping.exact && mapping.exact === name) {
      return mapping.bundle;
    }
    if (mapping.prefix && name.startsWith(mapping.prefix)) {
      return mapping.bundle;
    }
  }
  return "dev_core";
}

export function resolveEnabledBundles(config = {}) {
  const requestedBundles = parseCsv(config?.tooling?.bundles);
  if (requestedBundles.length > 0) {
    return new Set(requestedBundles);
  }

  const profile = String(config?.tooling?.deployProfile || "dev_full").trim();
  const bundles = PROFILE_BUNDLES[profile] || PROFILE_BUNDLES.dev_full;
  return new Set(bundles);
}

export function isToolEnabledForConfig(toolName, config = {}) {
  const disabledTools = new Set(parseCsv(config?.tooling?.disabledTools));
  if (disabledTools.has(toolName)) {
    return false;
  }

  const enabledBundles = resolveEnabledBundles(config);
  const bundle = inferBundleForTool(toolName);
  return enabledBundles.has(bundle);
}

export function getToolingPolicySummary(config = {}) {
  return {
    deploy_profile: config?.tooling?.deployProfile || "dev_full",
    enabled_bundles: Array.from(resolveEnabledBundles(config)),
    disabled_tools: parseCsv(config?.tooling?.disabledTools),
  };
}
