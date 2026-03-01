import test from "node:test";
import assert from "node:assert/strict";
import {
  getToolingPolicySummary,
  inferBundleForTool,
  isToolEnabledForConfig,
  resolveEnabledBundles,
} from "../src/server/tool-bundles.js";

test("inferBundleForTool maps known tools to expected bundles", () => {
  assert.equal(inferBundleForTool("sn.instance.info"), "dev_core");
  assert.equal(inferBundleForTool("sn.script.update"), "dev_validation");
  assert.equal(inferBundleForTool("sn.validate.script_include"), "dev_validation");
  assert.equal(inferBundleForTool("sn.changeset.list"), "dev_changesets");
  assert.equal(inferBundleForTool("sn.changeset.commit"), "dev_commit");
});

test("resolveEnabledBundles uses deploy profile defaults", () => {
  const bundles = resolveEnabledBundles({
    tooling: {
      deployProfile: "prod_readonly",
      bundles: "",
    },
  });

  assert.equal(bundles.has("dev_core"), true);
  assert.equal(bundles.has("dev_validation"), true);
  assert.equal(bundles.has("dev_changesets"), true);
  assert.equal(bundles.has("dev_commit"), false);
});

test("isToolEnabledForConfig supports explicit bundle override and disabled tool list", () => {
  const config = {
    tooling: {
      bundles: "dev_core,dev_changesets",
      disabledTools: "sn.changeset.list",
    },
  };

  assert.equal(isToolEnabledForConfig("sn.instance.info", config), true);
  assert.equal(isToolEnabledForConfig("sn.changeset.gaps", config), true);
  assert.equal(isToolEnabledForConfig("sn.script.get", config), false);
  assert.equal(isToolEnabledForConfig("sn.changeset.list", config), false);
});

test("getToolingPolicySummary returns normalized policy details", () => {
  const summary = getToolingPolicySummary({
    tooling: {
      deployProfile: "dev_safe",
      bundles: "",
      disabledTools: "sn.script.update,sn.script.create",
    },
  });

  assert.equal(summary.deploy_profile, "dev_safe");
  assert.equal(Array.isArray(summary.enabled_bundles), true);
  assert.equal(summary.enabled_bundles.includes("dev_commit"), false);
  assert.deepEqual(summary.disabled_tools, ["sn.script.update", "sn.script.create"]);
});
