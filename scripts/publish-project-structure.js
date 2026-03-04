import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ROOT_CONTEXT_FILES = ["README.md", "LLM_START_HERE.md", "PROJECT_CONTEXT_INDEX.md"];
const CONTEXT_DIRS = ["docs", "Epics", "Project PRD"];
const OUTPUT_SCRIPTS_JSON = path.join("artifacts", "project-structure-scripts.json");
const OUTPUT_CONTEXT_JSON = path.join("artifacts", "project-structure-context.json");
const OUTPUT_MARKDOWN = path.join("docs", "PROJECT_STRUCTURE_PUBLISH.md");
const EXCLUDED_CONTEXT_FILES = new Set([normalizePath(OUTPUT_MARKDOWN)]);

function normalizePath(p) {
  return p.split(path.sep).join("/");
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function isMarkdownFile(p) {
  const lower = p.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function deriveTags(relativePath, category) {
  const p = relativePath.toLowerCase();
  const tags = new Set([category]);

  if (category === "script") {
    if (p.includes("test-")) tags.add("test");
    if (p.includes("deploy")) tags.add("deploy");
    if (p.includes("build")) tags.add("build");
    if (p.includes("suite")) tags.add("suite");
    if (p.includes("publish-project-structure")) tags.add("structure-publish");
  }

  if (category === "context") {
    if (p.includes("llm") || p.includes("context")) tags.add("context-pack");
    if (p.includes("gate") || p.includes("milestone") || p.includes("status_board") || p.includes("checklist")) tags.add("gate");
    if (p.includes("runbook")) tags.add("runbook");
    if (p.includes("epics/")) tags.add("epic");
    if (p.includes("project prd/")) tags.add("prd");
    if (p.includes("security")) tags.add("security");
    if (p.endsWith("readme.md")) tags.add("readme");
  }

  return Array.from(tags).sort();
}

function toEntry(relativePath, category) {
  const fullPath = path.join(ROOT, relativePath);
  const stat = fs.statSync(fullPath);
  return {
    path: normalizePath(relativePath),
    category,
    size_bytes: stat.size,
    last_modified: stat.mtime.toISOString(),
    tags: deriveTags(normalizePath(relativePath), category)
  };
}

export function discoverScriptFiles() {
  const scriptsRoot = path.join(ROOT, "scripts");
  return walkFiles(scriptsRoot)
    .map((p) => normalizePath(path.relative(ROOT, p)))
    .filter((p) => p.toLowerCase().endsWith(".js"))
    .sort((a, b) => a.localeCompare(b));
}

export function discoverContextFiles() {
  const discovered = new Set();

  for (const rel of ROOT_CONTEXT_FILES) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) discovered.add(normalizePath(rel));
  }

  for (const dir of CONTEXT_DIRS) {
    const fullDir = path.join(ROOT, dir);
    for (const file of walkFiles(fullDir).map((p) => normalizePath(path.relative(ROOT, p))).filter((p) => isMarkdownFile(p))) {
      if (EXCLUDED_CONTEXT_FILES.has(file)) continue;
      discovered.add(file);
    }
  }

  return Array.from(discovered).sort((a, b) => a.localeCompare(b));
}

function maxIsoDate(entries) {
  if (entries.length === 0) return new Date(0).toISOString();
  const maxMs = entries
    .map((entry) => Date.parse(entry.last_modified))
    .reduce((acc, value) => Math.max(acc, value), 0);
  return new Date(maxMs).toISOString();
}

function createManifest(entries, includeCategory) {
  return {
    generated_at: maxIsoDate(entries),
    repo_root: normalizePath(ROOT),
    scripts: includeCategory === "script" ? entries : [],
    context_files: includeCategory === "context" ? entries : []
  };
}

function toJson(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function tableRows(entries) {
  return entries
    .map((entry) => `| \`${entry.path}\` | ${entry.tags.join(", ")} | ${entry.size_bytes} | ${entry.last_modified} |`)
    .join("\n");
}

function toMarkdown(scriptsEntries, contextEntries, scriptsManifest, contextManifest) {
  const scriptsRows = scriptsEntries.length > 0 ? tableRows(scriptsEntries) : "| _(none)_ | - | - | - |";
  const contextRows = contextEntries.length > 0 ? tableRows(contextEntries) : "| _(none)_ | - | - | - |";

  return `# Project Structure Publish

## Generation Metadata

- Command: \`node scripts/publish-project-structure.js --write\`
- Source scope (scripts): \`scripts/**/*.js\`
- Source scope (context): root (\`README.md\`, \`LLM_START_HERE.md\`, \`PROJECT_CONTEXT_INDEX.md\`) + \`docs/**/*.md\` + \`Epics/**/*.md\` + \`Project PRD/**/*.md\`
- Generated at (scripts manifest): ${scriptsManifest.generated_at}
- Generated at (context manifest): ${contextManifest.generated_at}

## Scripts Structure

| Path | Tags | Size (bytes) | Last Modified (UTC) |
| --- | --- | ---: | --- |
${scriptsRows}

## Context Files Structure

| Path | Tags | Size (bytes) | Last Modified (UTC) |
| --- | --- | ---: | --- |
${contextRows}
`;
}

export function buildProjectStructureArtifacts() {
  const scriptsEntries = discoverScriptFiles().map((relativePath) => toEntry(relativePath, "script"));
  const contextEntries = discoverContextFiles().map((relativePath) => toEntry(relativePath, "context"));

  const scriptsManifest = createManifest(scriptsEntries, "script");
  const contextManifest = createManifest(contextEntries, "context");

  return {
    scriptsManifest,
    contextManifest,
    scriptsJson: toJson(scriptsManifest),
    contextJson: toJson(contextManifest),
    markdown: toMarkdown(scriptsEntries, contextEntries, scriptsManifest, contextManifest)
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function checkOutputs(artifacts) {
  const expected = [
    { path: OUTPUT_SCRIPTS_JSON, content: artifacts.scriptsJson },
    { path: OUTPUT_CONTEXT_JSON, content: artifacts.contextJson },
    { path: OUTPUT_MARKDOWN, content: artifacts.markdown }
  ];

  const mismatches = [];
  for (const file of expected) {
    if (readIfExists(file.path) !== file.content) mismatches.push(file.path);
  }

  if (mismatches.length > 0) {
    console.error("Structure outputs are out of date:");
    for (const mismatch of mismatches) console.error(`- ${normalizePath(mismatch)}`);
    console.error("Run: npm run structure:publish");
    process.exit(1);
  }

  console.log("Structure outputs are up to date.");
}

function writeOutputs(artifacts) {
  const outputs = [
    { path: OUTPUT_SCRIPTS_JSON, content: artifacts.scriptsJson },
    { path: OUTPUT_CONTEXT_JSON, content: artifacts.contextJson },
    { path: OUTPUT_MARKDOWN, content: artifacts.markdown }
  ];

  for (const output of outputs) {
    ensureDir(output.path);
    fs.writeFileSync(output.path, output.content, "utf8");
  }

  console.log("Generated:");
  for (const output of outputs) console.log(`- ${normalizePath(output.path)}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const writeMode = args.has("--write");
  const checkMode = args.has("--check");

  if ((writeMode && checkMode) || (!writeMode && !checkMode)) {
    console.error("Usage: node scripts/publish-project-structure.js --write|--check");
    process.exit(2);
  }

  const artifacts = buildProjectStructureArtifacts();
  if (writeMode) {
    writeOutputs(artifacts);
    return;
  }

  checkOutputs(artifacts);
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url === entryUrl) {
    main();
  }
}
