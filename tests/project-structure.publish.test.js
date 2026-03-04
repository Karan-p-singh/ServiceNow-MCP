import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectStructureArtifacts, discoverContextFiles, discoverScriptFiles } from "../scripts/publish-project-structure.js";

function isIsoDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assertSortedByPath(entries) {
  const paths = entries.map((entry) => entry.path);
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(paths, sorted);
}

test("project structure discovery includes required context scope", () => {
  const context = discoverContextFiles();
  assert.ok(context.includes("README.md"));
  assert.ok(context.includes("LLM_START_HERE.md"));
  assert.ok(context.includes("PROJECT_CONTEXT_INDEX.md"));
  assert.ok(context.some((p) => p.startsWith("docs/") && p.endsWith(".md")));
  assert.ok(context.some((p) => p.startsWith("Epics/") && p.endsWith(".md")));
  assert.ok(context.some((p) => p.startsWith("Project PRD/") && p.endsWith(".md")));
});

test("project structure artifacts expose stable schema with ISO timestamps", () => {
  const artifacts = buildProjectStructureArtifacts();
  const scripts = JSON.parse(artifacts.scriptsJson);
  const context = JSON.parse(artifacts.contextJson);

  for (const manifest of [scripts, context]) {
    assert.equal(typeof manifest.generated_at, "string");
    assert.ok(isIsoDate(manifest.generated_at));
    assert.equal(typeof manifest.repo_root, "string");
    assert.ok(Array.isArray(manifest.scripts));
    assert.ok(Array.isArray(manifest.context_files));
  }

  for (const entry of [...scripts.scripts, ...context.context_files]) {
    assert.equal(typeof entry.path, "string");
    assert.equal(typeof entry.category, "string");
    assert.equal(typeof entry.size_bytes, "number");
    assert.ok(isIsoDate(entry.last_modified));
    assert.ok(Array.isArray(entry.tags));
  }
});

test("project structure outputs are sorted by ascending path", () => {
  const artifacts = buildProjectStructureArtifacts();
  const scriptsManifest = JSON.parse(artifacts.scriptsJson);
  const contextManifest = JSON.parse(artifacts.contextJson);

  assertSortedByPath(scriptsManifest.scripts);
  assertSortedByPath(contextManifest.context_files);

  const discoveredScripts = discoverScriptFiles();
  const sortedScripts = [...discoveredScripts].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(discoveredScripts, sortedScripts);
});
