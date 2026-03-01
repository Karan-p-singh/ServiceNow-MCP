const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RESTORABLE_TABLES = new Set([
  "sys_script_include",
  "sys_properties",
  "sys_ui_action",
  "sys_dictionary",
  "sys_choice",
  "wf_workflow",
  "sys_hub_flow",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeErrorCode(status, fallback = "SERVICENOW_REQUEST_FAILED") {
  if (status === 401) return "SN_AUTH_UNAUTHORIZED";
  if (status === 403) return "SN_AUTH_FORBIDDEN";
  if (status === 404) return "SN_RESOURCE_NOT_FOUND";
  if (status === 429) return "SN_RATE_LIMITED";
  if (status >= 500) return "SN_SERVER_ERROR";
  return fallback;
}

function normalizeServiceNowError({ error, status, statusText, details, path, instanceUrl, attempt }) {
  const statusNumber = Number.isFinite(status) ? status : undefined;
  const code = normalizeErrorCode(statusNumber);
  const message =
    details?.error?.message ||
    details?.message ||
    (error instanceof Error ? error.message : String(error || "Unknown ServiceNow error"));

  return {
    code,
    message,
    status: statusNumber,
    status_text: statusText || undefined,
    retriable: Boolean(statusNumber && RETRYABLE_HTTP_STATUSES.has(statusNumber)),
    details: {
      instance: instanceUrl,
      path,
      attempt,
    },
  };
}

function buildInstanceDescriptor(instance) {
  return {
    instance: {
      key: instance.key,
      url: instance.instanceUrl,
    },
    auth: {
      mode: instance.auth?.mode || "oauth",
      credentials_configured:
        Boolean(instance.auth?.accessToken) ||
        (Boolean(instance.auth?.username) && Boolean(instance.auth?.password)),
    },
  };
}

const PLUGIN_PROBE_TABLE_CANDIDATES = ["v_plugin", "sys_plugins"];

export class ServiceNowClient {
  constructor({ config, fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.config = config || {};
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  resolveInstance(instanceKey) {
    const key = instanceKey || this.config?.defaultInstance;
    const instance = this.config?.instances?.[key];
    if (!instance) {
      throw new Error(`Unknown ServiceNow instance key: ${String(key || "<none>")}`);
    }
    return instance;
  }

  buildAuthHeaders(instance) {
    const auth = instance?.auth || {};
    const mode = String(auth.mode || "oauth").toLowerCase();

    if (mode === "oauth") {
      if (auth.accessToken) {
        return {
          Authorization: `Bearer ${auth.accessToken}`,
        };
      }
      return {};
    }

    if (mode === "basic" && auth.username && auth.password) {
      const token = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
      return {
        Authorization: `Basic ${token}`,
      };
    }

    return {};
  }

  isMockInstance(instanceUrl) {
    return String(instanceUrl || "").includes("example.service-now.com");
  }

  async request({ method = "GET", path, query = {}, body, instanceKey, headers = {} } = {}) {
    const instance = this.resolveInstance(instanceKey);
    if (this.isMockInstance(instance.instanceUrl)) {
      return this.mockRequest({ method, path, query, body, instance });
    }

    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch is not available in this runtime");
    }

    const attempts = Math.max(1, this.config?.retry?.maxAttempts || 1);
    const baseDelayMs = Math.max(25, this.config?.retry?.baseDelayMs || 200);
    const timeoutMs = Math.max(250, this.config?.retry?.requestTimeoutMs || 4000);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const url = new URL(path, instance.instanceUrl);
      for (const [key, value] of Object.entries(query || {})) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...this.buildAuthHeaders(instance),
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const text = await response.text();
        let payload = {};
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = { raw_response: text };
          }
        }

        if (!response.ok) {
          const normalizedError = normalizeServiceNowError({
            status: response.status,
            statusText: response.statusText,
            details: payload,
            path,
            instanceUrl: instance.instanceUrl,
            attempt,
          });

          if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < attempts) {
            await sleep(baseDelayMs * attempt);
            lastError = normalizedError;
            continue;
          }

          throw normalizedError;
        }

        return {
          status: response.status,
          data: payload,
          headers: {
            link: response.headers.get("link") || "",
          },
          attempt,
        };
      } catch (error) {
        clearTimeout(timeout);

        const normalized = isObject(error) && error.code
          ? error
          : normalizeServiceNowError({
              error,
              details: null,
              path,
              instanceUrl: instance.instanceUrl,
              attempt,
            });

        if (normalized.retriable && attempt < attempts) {
          await sleep(baseDelayMs * attempt);
          lastError = normalized;
          continue;
        }

        throw normalized;
      }
    }

    throw lastError || {
      code: "SERVICENOW_REQUEST_FAILED",
      message: "Request failed after retries",
      details: { path, instance: instance.instanceUrl },
    };
  }

  async listTable({ table, limit = 50, offset = 0, query = "", instanceKey } = {}) {
    const response = await this.request({
      method: "GET",
      path: `/api/now/table/${table}`,
      query: {
        sysparm_limit: limit,
        sysparm_offset: offset,
        sysparm_query: query,
      },
      instanceKey,
    });

    const records = Array.isArray(response?.data?.result) ? response.data.result : [];
    const hasMore = records.length === limit;

    return {
      records,
      page: {
        limit,
        offset,
        returned: records.length,
        has_more: hasMore,
        next_offset: hasMore ? offset + records.length : null,
      },
    };
  }

  async getTableRecord({ table, sysId, query = "", instanceKey } = {}) {
    if (sysId) {
      const response = await this.request({
        method: "GET",
        path: `/api/now/table/${table}/${sysId}`,
        instanceKey,
      });

      return {
        found: Boolean(response?.data?.result),
        record: response?.data?.result || null,
        query: {
          table,
          sys_id: sysId,
          sysparm_query: query || "",
        },
      };
    }

    const page = await this.listTable({
      table,
      limit: 1,
      offset: 0,
      query,
      instanceKey,
    });

    const record = page.records?.[0] || null;
    return {
      found: Boolean(record),
      record,
      query: {
        table,
        sys_id: null,
        sysparm_query: query || "",
      },
    };
  }

  async countTable({ table, query = "", instanceKey } = {}) {
    const response = await this.request({
      method: "GET",
      path: `/api/now/stats/${table}`,
      query: {
        sysparm_query: query,
        sysparm_count: true,
      },
      instanceKey,
    });

    const rawCount =
      response?.data?.result?.stats?.count ||
      response?.data?.result?.count ||
      response?.data?.result?.stats?.COUNT ||
      0;

    return {
      table,
      sysparm_query: query || "",
      count: Number(rawCount) || 0,
      source: this.isMockInstance(this.resolveInstance(instanceKey).instanceUrl) ? "mock" : "live",
    };
  }

  async listInstancePlugins({ limit = 100, offset = 0, instanceKey } = {}) {
    for (const table of PLUGIN_PROBE_TABLE_CANDIDATES) {
      try {
        const page = await this.listTable({
          table,
          limit,
          offset,
          instanceKey,
        });
        return {
          table,
          records: page.records,
          page: page.page,
        };
      } catch {
        // continue probe fallback
      }
    }

    return {
      table: PLUGIN_PROBE_TABLE_CANDIDATES[0],
      records: [],
      page: {
        limit,
        offset,
        returned: 0,
        has_more: false,
        next_offset: null,
      },
    };
  }

  async getInstanceInfo({ instanceKey } = {}) {
    const instance = this.resolveInstance(instanceKey);
    const descriptor = buildInstanceDescriptor(instance);

    if (this.isMockInstance(instance.instanceUrl)) {
      return {
        ...descriptor,
        connectivity: {
          reachable: true,
          source: "mock",
        },
        capabilities: {
          release: "mock-release",
          plugins: ["com.snc.scripted_rest_api", "com.glide.update_set"],
          supports: {
            oauth: true,
            basic: true,
            table_api: true,
            pagination: true,
          },
        },
      };
    }

    let tableApiAccessible = false;
    let tableApiProbe = null;
    try {
      await this.listTable({
        table: "sys_db_object",
        limit: 1,
        offset: 0,
        instanceKey,
      });
      tableApiAccessible = true;
      tableApiProbe = { table: "sys_db_object", status: "ok" };
    } catch (error) {
      tableApiProbe = {
        table: "sys_db_object",
        status: "failed",
        error: isObject(error) ? error : { message: String(error) },
      };
    }

    let plugins = [];
    let pluginProbe = null;
    const pluginProbeFailures = [];
    for (const table of PLUGIN_PROBE_TABLE_CANDIDATES) {
      try {
        const pluginPage = await this.listTable({
          table,
          limit: 10,
          offset: 0,
          instanceKey,
        });
        plugins = pluginPage.records
          .map((record) => record.name || record.id || record.sys_id)
          .filter(Boolean);
        pluginProbe = { table, status: "ok", plugin_count: plugins.length };
        break;
      } catch (error) {
        const normalized = isObject(error) ? error : { message: String(error) };
        pluginProbeFailures.push({ table, error: normalized });
      }
    }

    if (!pluginProbe) {
      const lastFailure = pluginProbeFailures[pluginProbeFailures.length - 1];
      pluginProbe = {
        table: lastFailure?.table || PLUGIN_PROBE_TABLE_CANDIDATES[0],
        status: "failed",
        attempted_tables: PLUGIN_PROBE_TABLE_CANDIDATES,
        error: lastFailure?.error || { message: "Plugin probe failed" },
      };
    }

    return {
      ...descriptor,
      connectivity: {
        reachable: true,
        source: "live",
      },
      capabilities: {
        plugins,
        supports: {
          oauth: true,
          basic: true,
          table_api: tableApiAccessible,
          pagination: true,
        },
        probes: {
          table_api: tableApiProbe,
          plugins: pluginProbe,
        },
      },
    };
  }

  async getScriptInclude({ sysId, name, instanceKey } = {}) {
    let query = "";
    if (sysId) {
      query = `sys_id=${sysId}`;
    } else if (name) {
      query = `name=${name}`;
    }

    const response = await this.request({
      method: "GET",
      path: "/api/now/table/sys_script_include",
      query: {
        sysparm_limit: 1,
        sysparm_offset: 0,
        sysparm_query: query,
      },
      instanceKey,
    });

    const records = Array.isArray(response?.data?.result) ? response.data.result : [];
    const script = records[0] || null;

    return {
      found: Boolean(script),
      script,
      query: {
        sys_id: sysId || null,
        name: name || null,
      },
    };
  }

  async listScriptIncludes({ limit = 25, offset = 0, query = "", instanceKey } = {}) {
    return this.listTable({
      table: "sys_script_include",
      limit,
      offset,
      query,
      instanceKey,
    });
  }

  async searchScriptIncludes({ term = "", limit = 25, offset = 0, instanceKey } = {}) {
    const normalizedTerm = String(term || "").trim();
    const query = normalizedTerm
      ? `nameLIKE${normalizedTerm}^ORscriptLIKE${normalizedTerm}^ORdescriptionLIKE${normalizedTerm}`
      : "";

    return this.listScriptIncludes({
      limit,
      offset,
      query,
      instanceKey,
    });
  }

  async createScriptInclude({ record, instanceKey } = {}) {
    const response = await this.request({
      method: "POST",
      path: "/api/now/table/sys_script_include",
      body: record || {},
      instanceKey,
    });

    return {
      created: true,
      record: response?.data?.result || null,
    };
  }

  async updateScriptInclude({ sysId, changes, instanceKey } = {}) {
    const response = await this.request({
      method: "PATCH",
      path: `/api/now/table/sys_script_include/${sysId}`,
      body: changes || {},
      instanceKey,
    });

    return {
      updated: true,
      record: response?.data?.result || null,
    };
  }

  async listScriptIncludeHistory({ sysId, limit = 20, offset = 0, instanceKey } = {}) {
    const resolvedSysId = String(sysId || "").trim();
    if (!resolvedSysId) {
      return {
        script_sys_id: null,
        records: [],
        page: {
          limit,
          offset,
          returned: 0,
          has_more: false,
          next_offset: null,
        },
      };
    }

    const page = await this.listTable({
      table: "sys_audit",
      limit,
      offset,
      query: `tablename=sys_script_include^documentkey=${resolvedSysId}^fieldname=script^ORDERBYDESCsys_created_on`,
      instanceKey,
    });

    return {
      script_sys_id: resolvedSysId,
      records: page.records,
      page: page.page,
    };
  }

  async diffScriptInclude({ sysId, baseVersion, targetVersion, instanceKey } = {}) {
    const history = await this.listScriptIncludeHistory({
      sysId,
      limit: 50,
      offset: 0,
      instanceKey,
    });

    const records = history.records || [];
    const base =
      records.find((entry) => String(entry?.sys_id || "") === String(baseVersion || "")) ||
      records[1] ||
      null;
    const target =
      records.find((entry) => String(entry?.sys_id || "") === String(targetVersion || "")) ||
      records[0] ||
      null;

    const baseScript = String(base?.oldvalue || base?.newvalue || "");
    const targetScript = String(target?.newvalue || target?.oldvalue || "");

    const beforeLines = baseScript.split("\n");
    const afterLines = targetScript.split("\n");
    let changedLineCount = 0;
    const lineCount = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < lineCount; i += 1) {
      if ((beforeLines[i] || "") !== (afterLines[i] || "")) {
        changedLineCount += 1;
      }
    }

    return {
      script_sys_id: String(sysId || "") || null,
      base_version: base?.sys_id || null,
      target_version: target?.sys_id || null,
      changed_line_count: changedLineCount,
      summary: {
        has_changes: changedLineCount > 0,
        base_chars: baseScript.length,
        target_chars: targetScript.length,
      },
      base_excerpt: baseScript.slice(0, 4000),
      target_excerpt: targetScript.slice(0, 4000),
      limitations: [
        "Diff output is summary-oriented and does not claim full semantic equivalence.",
      ],
    };
  }

  async listChangesets({ limit = 25, offset = 0, query = "", instanceKey } = {}) {
    return this.listTable({
      table: "sys_update_set",
      limit,
      offset,
      query,
      instanceKey,
    });
  }

  async listFlows({ limit = 25, offset = 0, query = "", instanceKey } = {}) {
    return this.listTable({
      table: "sys_hub_flow",
      limit,
      offset,
      query,
      instanceKey,
    });
  }

  async getFlow({ sysId, name, query, instanceKey } = {}) {
    if (sysId) {
      const response = await this.request({
        method: "GET",
        path: `/api/now/table/sys_hub_flow/${sysId}`,
        instanceKey,
      });

      return {
        found: Boolean(response?.data?.result),
        record: response?.data?.result || null,
        query: {
          sys_id: sysId,
          name: name || null,
          sysparm_query: query || "",
        },
      };
    }

    let resolvedQuery = String(query || "").trim();
    if (!resolvedQuery && name) {
      resolvedQuery = `name=${name}`;
    }

    const page = await this.listFlows({
      limit: 1,
      offset: 0,
      query: resolvedQuery,
      instanceKey,
    });

    const record = page.records?.[0] || null;
    return {
      found: Boolean(record),
      record,
      query: {
        sys_id: sysId || null,
        name: name || null,
        sysparm_query: resolvedQuery,
      },
    };
  }

  async listWorkflows({ limit = 25, offset = 0, query = "", instanceKey } = {}) {
    return this.listTable({
      table: "wf_workflow",
      limit,
      offset,
      query,
      instanceKey,
    });
  }

  async getWorkflow({ sysId, name, query, instanceKey } = {}) {
    if (sysId) {
      const response = await this.request({
        method: "GET",
        path: `/api/now/table/wf_workflow/${sysId}`,
        instanceKey,
      });

      return {
        found: Boolean(response?.data?.result),
        record: response?.data?.result || null,
        query: {
          sys_id: sysId,
          name: name || null,
          sysparm_query: query || "",
        },
      };
    }

    let resolvedQuery = String(query || "").trim();
    if (!resolvedQuery && name) {
      resolvedQuery = `name=${name}`;
    }

    const page = await this.listWorkflows({
      limit: 1,
      offset: 0,
      query: resolvedQuery,
      instanceKey,
    });

    const record = page.records?.[0] || null;
    return {
      found: Boolean(record),
      record,
      query: {
        sys_id: sysId || null,
        name: name || null,
        sysparm_query: resolvedQuery,
      },
    };
  }

  async getChangeset({ sysId, name, query, instanceKey } = {}) {
    if (sysId) {
      const response = await this.request({
        method: "GET",
        path: `/api/now/table/sys_update_set/${sysId}`,
        instanceKey,
      });

      return {
        found: Boolean(response?.data?.result),
        record: response?.data?.result || null,
        query: {
          sys_id: sysId,
          name: name || null,
          sysparm_query: query || "",
        },
      };
    }

    let resolvedQuery = String(query || "").trim();
    if (!resolvedQuery && name) {
      resolvedQuery = `name=${name}`;
    }

    const page = await this.listChangesets({
      limit: 1,
      offset: 0,
      query: resolvedQuery,
      instanceKey,
    });

    const record = page.records?.[0] || null;
    return {
      found: Boolean(record),
      record,
      query: {
        sys_id: sysId || null,
        name: name || null,
        sysparm_query: resolvedQuery,
      },
    };
  }

  async listChangesetContents({ changesetSysId, limit = 50, offset = 0, query = "", instanceKey } = {}) {
    const clauses = [];
    if (changesetSysId) {
      clauses.push(`update_set=${changesetSysId}`);
    }
    if (query) {
      clauses.push(String(query));
    }

    return this.listTable({
      table: "sys_update_xml",
      limit,
      offset,
      query: clauses.join("^"),
      instanceKey,
    });
  }

  async exportChangeset({ sysId, format = "xml", instanceKey } = {}) {
    const instance = this.resolveInstance(instanceKey);
    const normalizedFormat = String(format || "xml").trim().toLowerCase();
    const exportPath =
      normalizedFormat === "xml"
        ? `/sys_update_set.do?XML&sys_id=${encodeURIComponent(sysId || "")}`
        : `/sys_update_set.do?sys_id=${encodeURIComponent(sysId || "")}`;

    return {
      exported: Boolean(sysId),
      format: normalizedFormat,
      sys_id: sysId || null,
      path: exportPath,
      download_url: `${String(instance.instanceUrl || "").replace(/\/$/, "")}${exportPath}`,
    };
  }

  async detectChangesetGaps({ changesetSysId, limit = 200, offset = 0, instanceKey } = {}) {
    const page = await this.listChangesetContents({
      changesetSysId,
      limit,
      offset,
      instanceKey,
    });

    const hardMap = new Map();
    const softMap = new Map();
    const heuristicMap = new Map();

    for (const record of page.records || []) {
      const targetTable = String(record?.target_table || "").trim();
      const targetSysId = String(record?.target_sys_id || "").trim();
      const recordName = String(record?.name || "");

      if (targetTable && targetSysId) {
        const key = `${targetTable}:${targetSysId}`;
        if (!hardMap.has(key)) {
          hardMap.set(key, {
            artifact_type: targetTable,
            identifier: targetSysId,
            confidence: "high",
            reason_code: "XML_TARGET_REFERENCE",
            evidence: [{ type: "sys_update_xml", sys_id: record?.sys_id || null, name: recordName }],
          });
        }
      }

      const scriptIncludeMatch = recordName.match(/sys_script_include_([a-f0-9]{32})/i);
      if (scriptIncludeMatch) {
        const softKey = `sys_script_include:${scriptIncludeMatch[1]}`;
        if (!softMap.has(softKey)) {
          softMap.set(softKey, {
            artifact_type: "sys_script_include",
            identifier: scriptIncludeMatch[1],
            confidence: "medium",
            reason_code: "SCRIPT_INCLUDE_NAME_PATTERN",
            evidence: [{ type: "name_pattern", value: recordName }],
          });
        }
      }

      const genericSysIdMatches = recordName.match(/[a-f0-9]{32}/gi) || [];
      for (const sysId of genericSysIdMatches) {
        const heuristicKey = `unknown:${sysId.toLowerCase()}`;
        if (!heuristicMap.has(heuristicKey)) {
          heuristicMap.set(heuristicKey, {
            artifact_type: "unknown",
            identifier: sysId.toLowerCase(),
            confidence: "low",
            reason_code: "GENERIC_SYS_ID_PATTERN",
            evidence: [{ type: "name_pattern", value: recordName }],
          });
        }
      }
    }

    return {
      changeset_sys_id: changesetSysId || null,
      scanned_entries: page.records?.length || 0,
      hard_dependencies: Array.from(hardMap.values()),
      soft_dependencies: Array.from(softMap.values()),
      heuristic_candidates: Array.from(heuristicMap.values()),
      limitations: [
        "Dependency analysis is confidence-based and does not guarantee completeness.",
      ],
      page: page.page,
    };
  }

  async verifyChangesetCapture({ table, sysId, changesetSysId, instanceKey } = {}) {
    const targetTable = String(table || "").trim();
    const targetSysId = String(sysId || "").trim();

    const exactQuery = [
      targetTable ? `target_table=${targetTable}` : "",
      targetSysId ? `target_sys_id=${targetSysId}` : "",
    ]
      .filter(Boolean)
      .join("^");

    const exactMatches = await this.listTable({
      table: "sys_update_xml",
      limit: 50,
      offset: 0,
      query: exactQuery,
      instanceKey,
    });

    let records = exactMatches.records || [];
    if (records.length === 0 && targetTable && targetSysId) {
      const fallback = await this.listTable({
        table: "sys_update_xml",
        limit: 50,
        offset: 0,
        query: `nameLIKE${targetTable}_${targetSysId}`,
        instanceKey,
      });
      records = fallback.records || [];
    }

    const updateSets = [...new Set(records.map((record) => record?.update_set).filter(Boolean))];
    const inTargetSet = changesetSysId ? updateSets.includes(changesetSysId) : false;

    let reasonCode = "NOT_CAPTURED";
    if (inTargetSet) {
      reasonCode = "CAPTURED_IN_TARGET_SET";
    } else if (records.length > 0) {
      reasonCode = "CAPTURED_IN_DIFFERENT_SET";
    }

    return {
      table: targetTable || null,
      sys_id: targetSysId || null,
      changeset_sys_id: changesetSysId || null,
      captured: records.length > 0,
      captured_in_target_set: inTargetSet,
      reason_code: reasonCode,
      evidence: records.map((record) => ({
        sys_update_xml: record?.sys_id || null,
        name: record?.name || null,
        update_set: record?.update_set || null,
      })),
    };
  }

  async previewChangesetCommit({ changesetSysId, includeConflicts = true, instanceKey } = {}) {
    const resolvedChangesetSysId = String(changesetSysId || "").trim();
    if (!resolvedChangesetSysId) {
      return {
        preview_generated: false,
        write_side_effects: false,
        error: {
          code: "INVALID_PARAMS",
          message: "changeset_sys_id is required for commit preview.",
        },
      };
    }

    const changeset = await this.getChangeset({
      sysId: resolvedChangesetSysId,
      instanceKey,
    });

    const contents = await this.listChangesetContents({
      changesetSysId: resolvedChangesetSysId,
      limit: 500,
      offset: 0,
      instanceKey,
    });

    const records = Array.isArray(contents?.records) ? contents.records : [];
    const targetCounts = new Map();
    for (const record of records) {
      const key = `${String(record?.target_table || "")}:${String(record?.target_sys_id || "")}`;
      if (!key || key === ":") {
        continue;
      }
      targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
    }

    const potentialConflicts = [];
    for (const [key, count] of targetCounts.entries()) {
      if (count > 1) {
        const [targetTable, targetSysId] = key.split(":");
        potentialConflicts.push({
          conflict_type: "MULTIPLE_UPDATES_SAME_TARGET",
          confidence: "medium",
          target_table: targetTable || null,
          target_sys_id: targetSysId || null,
          occurrences: count,
          reason_code: "PREVIEW_DUPLICATE_TARGET_IN_SET",
          evidence: [
            {
              type: "changeset_contents_count",
              value: count,
            },
          ],
          mitigation: "Review ordering and final intended state for repeated target updates before commit.",
        });
      }
    }

    const sourceScope =
      changeset?.record?.application?.display_value ||
      changeset?.record?.application?.value ||
      changeset?.record?.application ||
      "unknown";
    const affectedTables = [...new Set(records.map((record) => String(record?.target_table || "").trim()).filter(Boolean))];
    const affectedScopes = [sourceScope];
    const crossScopeDetected = sourceScope === "global";

    const recommendedMitigations = [
      "Run sn.changeset.gaps and review hard/soft/heuristic dependency evidence before commit.",
      "Verify critical records with sn.updateset.capture.verify to reduce missed-capture risk.",
    ];
    if (crossScopeDetected) {
      recommendedMitigations.push(
        "Global-scope update set detected; re-check policy allowlists and break-glass approvals before any T3 commit operation.",
      );
    }
    if (includeConflicts && potentialConflicts.length > 0) {
      recommendedMitigations.push(
        "Resolve duplicate-target conflict candidates in preview output before promoting this update set.",
      );
    }

    return {
      preview_generated: true,
      write_side_effects: false,
      changeset: {
        sys_id: resolvedChangesetSysId,
        found: Boolean(changeset?.found),
        record: changeset?.record || null,
      },
      summary: {
        change_count: records.length,
        affected_tables_count: affectedTables.length,
        potential_conflict_count: includeConflicts ? potentialConflicts.length : 0,
        affected_scopes: affectedScopes,
      },
      scope_impact: {
        source_scope: sourceScope,
        affected_scopes: affectedScopes,
        cross_scope_detected: crossScopeDetected,
        cross_scope_risk_level: crossScopeDetected ? "high" : "low",
      },
      potential_conflicts: includeConflicts ? potentialConflicts : [],
      affected_tables: affectedTables,
      recommended_mitigations: recommendedMitigations,
      limitations: [
        "Preview is read-only and evidence-based; it does not execute or simulate a platform commit transaction.",
        "Conflict detection currently focuses on deterministic in-set signals and does not guarantee full completeness.",
      ],
      page: contents?.page || null,
    };
  }

  async commitChangesetControlled({ changesetSysId, reason, confirm = false, instanceKey } = {}) {
    const resolvedChangesetSysId = String(changesetSysId || "").trim();
    if (!resolvedChangesetSysId) {
      return {
        commit_requested: false,
        commit_executed: false,
        error: {
          code: "INVALID_PARAMS",
          message: "changeset_sys_id is required for controlled commit.",
        },
      };
    }

    const instance = this.resolveInstance(instanceKey);
    const changeset = await this.getChangeset({
      sysId: resolvedChangesetSysId,
      instanceKey,
    });
    const contents = await this.listChangesetContents({
      changesetSysId: resolvedChangesetSysId,
      limit: 500,
      offset: 0,
      instanceKey,
    });
    const records = Array.isArray(contents?.records) ? contents.records : [];

    const byArtifactTypeMap = new Map();
    let restorableCount = 0;
    let nonRestorableCount = 0;
    let unknownCount = 0;

    for (const record of records) {
      const table = String(record?.target_table || "").trim() || "unknown";
      const hasTarget = Boolean(String(record?.target_sys_id || "").trim());
      const restorable = RESTORABLE_TABLES.has(table);
      const classification = !hasTarget
        ? "unknown"
        : restorable
          ? "restorable"
          : "non_restorable";

      if (classification === "restorable") {
        restorableCount += 1;
      } else if (classification === "non_restorable") {
        nonRestorableCount += 1;
      } else {
        unknownCount += 1;
      }

      const current = byArtifactTypeMap.get(table) || {
        artifact_type: table,
        captured: 0,
        restorable: 0,
        non_restorable: 0,
        unknown: 0,
      };
      current.captured += 1;
      if (classification === "restorable") {
        current.restorable += 1;
      } else if (classification === "non_restorable") {
        current.non_restorable += 1;
      } else {
        current.unknown += 1;
      }
      byArtifactTypeMap.set(table, current);
    }

    const sourceScope =
      changeset?.record?.application?.display_value ||
      changeset?.record?.application?.value ||
      changeset?.record?.application ||
      "unknown";
    const globalScopeDetected = String(sourceScope).toLowerCase() === "global";
    const isMock = this.isMockInstance(instance.instanceUrl);

    return {
      commit_requested: true,
      commit_executed: isMock && confirm,
      execution_mode: isMock ? "mock_commit" : "controlled_noop",
      reason_code: isMock ? "COMMIT_EXECUTED_MOCK" : "COMMIT_NOT_EXECUTED_LIVE_SAFE_MODE",
      changeset: {
        sys_id: resolvedChangesetSysId,
        found: Boolean(changeset?.found),
        record: changeset?.record || null,
      },
      snapshot_coverage_matrix: {
        captured: records.length,
        restorable: restorableCount,
        non_restorable: nonRestorableCount,
        unknown: unknownCount,
        by_artifact_type: Array.from(byArtifactTypeMap.values()),
      },
      high_risk_audit_trace: {
        operation: "sn.changeset.commit",
        tier: "T3",
        confirm_required: true,
        confirm_received: Boolean(confirm),
        reason: String(reason || "").trim(),
        requested_at: new Date().toISOString(),
        actor: "mcp",
        source_scope: sourceScope,
        global_scope_detected: globalScopeDetected,
      },
      limitations: [
        "Controlled commit output is evidence-driven and does not guarantee transactional rollback semantics.",
        isMock
          ? "Mock mode marks commit_executed for contract testing only."
          : "Live mode currently returns controlled_noop to avoid unsafe write side effects without platform-native transaction controls.",
      ],
      page: contents?.page || null,
    };
  }

  async generateRollbackPlan({ changesetSysId, instanceKey } = {}) {
    const resolvedChangesetSysId = String(changesetSysId || "").trim();
    if (!resolvedChangesetSysId) {
      return {
        generated: false,
        error: {
          code: "INVALID_PARAMS",
          message: "changeset_sys_id is required for rollback planning.",
        },
      };
    }

    const changeset = await this.getChangeset({
      sysId: resolvedChangesetSysId,
      instanceKey,
    });
    const contents = await this.listChangesetContents({
      changesetSysId: resolvedChangesetSysId,
      limit: 500,
      offset: 0,
      instanceKey,
    });
    const records = Array.isArray(contents?.records) ? contents.records : [];

    const restorable = [];
    const nonRestorable = [];
    for (const record of records) {
      const table = String(record?.target_table || "").trim() || "unknown";
      const item = {
        table,
        sys_id: String(record?.target_sys_id || "").trim() || null,
        name: record?.name || null,
        update_xml: record?.sys_id || null,
      };

      if (RESTORABLE_TABLES.has(table)) {
        restorable.push({
          ...item,
          rollback_method: "restore_previous_version_or_reapply_prior_update_set",
        });
      } else {
        nonRestorable.push({
          ...item,
          non_restorable_reason: "MANUAL_RECONSTRUCTION_REQUIRED",
        });
      }
    }

    const sourceScope =
      changeset?.record?.application?.display_value ||
      changeset?.record?.application?.value ||
      changeset?.record?.application ||
      "unknown";
    const globalScopeDetected = String(sourceScope).toLowerCase() === "global";
    const riskLevel = nonRestorable.length > 0 || globalScopeDetected ? "high" : "medium";

    return {
      generated: true,
      changeset: {
        sys_id: resolvedChangesetSysId,
        found: Boolean(changeset?.found),
        record: changeset?.record || null,
      },
      restorable,
      non_restorable: nonRestorable,
      declarations: {
        fully_restorable: nonRestorable.length === 0,
        contains_non_restorable: nonRestorable.length > 0,
      },
      manual_steps: [
        "Export current update set and preserve a point-in-time artifact snapshot before rollback operations.",
        "For restorable records, apply prior known-good versions or revert using targeted update entries.",
        "For non-restorable entries, execute documented manual remediation and verify post-state in instance.",
        "Run smoke/integration checks after rollback to confirm platform stability.",
      ],
      risk_level: riskLevel,
      reason_code: nonRestorable.length > 0 ? "ROLLBACK_PARTIAL_MANUAL_REQUIRED" : "ROLLBACK_RESTORABLE_WITH_STEPS",
      limitations: [
        "Rollback planning is advisory and does not perform automatic revert operations.",
        "Non-restorable entries require explicit human approval and manual execution.",
      ],
      page: contents?.page || null,
    };
  }

  mockRequest({ method = "GET", path, query = {}, body = {}, instance }) {
    if (path.includes("/api/x_mcp_companion/v1/health")) {
      return Promise.resolve({
        status: 200,
        data: {
          result: {
            status: "ok",
            version: "1.2.0",
            app_scope: "x_mcp_companion",
          },
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/api/x_mcp_companion/v1/acl/evaluate")) {
      const operation = String(body?.operation || "read").toLowerCase();
      const decision = operation === "write" ? "deny" : "allow";
      return Promise.resolve({
        status: 200,
        data: {
          result: {
            decision,
            reasoning_summary:
              decision === "allow"
                ? "Mock companion allows read operation."
                : "Mock companion denies write operation.",
            evaluated_acls: [
              {
                acl: `${body?.table || "task"}.${body?.field || "*"}.${operation}`,
                decision,
              },
            ],
          },
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_plugins") || path.includes("/v_plugin")) {
      return Promise.resolve({
        status: 200,
        data: {
          result: [
            { name: "com.snc.scripted_rest_api" },
            { name: "com.glide.update_set" },
            { name: "com.glide.script.fencing" },
          ],
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/api/now/stats/")) {
      const table = path.split("/api/now/stats/")[1] || "unknown";
      return Promise.resolve({
        status: 200,
        data: {
          result: {
            stats: {
              count: table === "sys_script_include" ? 2 : 3,
            },
          },
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_db_object")) {
      const sampleTables = [
        {
          sys_id: "d1111111d2222222d3333333d4444444",
          name: "incident",
          label: "Incident",
          super_class: "task",
        },
        {
          sys_id: "d5555555d6666666d7777777d8888888",
          name: "sys_script_include",
          label: "Script Include",
          super_class: "sys_metadata",
        },
      ];

      const upperMethod = String(method).toUpperCase();
      if (upperMethod === "GET" && /\/sys_db_object\/[a-z0-9]+$/i.test(path)) {
        const sysId = path.split("/").pop();
        const record = sampleTables.find((entry) => entry.sys_id === sysId);
        if (!record) {
          return Promise.reject({
            code: "SN_RESOURCE_NOT_FOUND",
            message: "No Record found",
            status: 404,
            status_text: "Not Found",
            retriable: false,
            details: {
              instance: instance.instanceUrl,
              path,
              attempt: 1,
            },
          });
        }
        return Promise.resolve({
          status: 200,
          data: {
            result: record,
          },
          headers: {},
          attempt: 1,
        });
      }

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleTables;
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleTables.filter((entry) => entry.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_audit")) {
      const sampleAudit = [
        {
          sys_id: "h1111111h2222222h3333333h4444444",
          tablename: "sys_script_include",
          documentkey: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
          fieldname: "script",
          oldvalue: "gs.info('v1');",
          newvalue: "gs.info('v2');",
          sys_created_on: "2026-03-01 01:00:00",
          user: "admin",
        },
        {
          sys_id: "h5555555h6666666h7777777h8888888",
          tablename: "sys_script_include",
          documentkey: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
          fieldname: "script",
          oldvalue: "gs.info('v0');",
          newvalue: "gs.info('v1');",
          sys_created_on: "2026-02-28 23:00:00",
          user: "admin",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleAudit;
      const documentMatch = sysparmQuery.match(/documentkey=([a-f0-9]{32})/i);
      if (documentMatch) {
        filtered = filtered.filter((entry) => entry.documentkey === documentMatch[1]);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_security_acl")) {
      return Promise.resolve({
        status: 200,
        data: {
          result: [
            {
              sys_id: "mock-acl-1",
              name: "incident.*.read",
              operation: "read",
              type: "record",
              active: "true",
            },
            {
              sys_id: "mock-acl-2",
              name: "incident.short_description.write",
              operation: "write",
              type: "record",
              active: "true",
            },
          ],
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_user_has_role")) {
      return Promise.resolve({
        status: 200,
        data: {
          result: [
            {
              user: { value: body?.user || "mock-user" },
              role: { display_value: "itil" },
            },
          ],
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_script_include")) {
      const sampleRecords = [
        {
          sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
          name: "x_demo_utility",
          api_name: "x_demo_utility",
          sys_scope: { display_value: "x_demo_scope", value: "x_demo_scope" },
          active: "true",
          script: "var gr = new GlideRecord('incident');\ngr.query();\nwhile (gr.next()) {\n  // noop\n}\n",
          description: "Mock script include used for baseline retrieval",
          sys_updated_on: "2026-02-28 19:00:00",
        },
        {
          sys_id: "aaabbbcccdddeeefff11122233344455",
          name: "x_demo_eval_helper",
          api_name: "x_demo_eval_helper",
          sys_scope: { display_value: "x_demo_scope", value: "x_demo_scope" },
          active: "true",
          script: "function run(input) {\n  return eval(input);\n}\n",
          description: "Mock script include with CRITICAL finding",
          sys_updated_on: "2026-02-28 19:05:00",
        },
      ];

      if (String(method).toUpperCase() === "POST") {
        return Promise.resolve({
          status: 201,
          data: {
            result: {
              sys_id: "mock-created-script-include",
              name: body?.name || "unnamed_script",
              api_name: body?.api_name || body?.name || "unnamed_script",
              script: body?.script || "",
              description: body?.description || "",
              sys_scope: body?.sys_scope || { display_value: body?.scope || "global", value: body?.scope || "global" },
              active: String(body?.active ?? "true"),
              sys_updated_on: "2026-02-28 22:00:00",
            },
          },
          headers: {},
          attempt: 1,
        });
      }

      if (String(method).toUpperCase() === "PATCH") {
        const sysId = path.split("/").pop();
        const existing = sampleRecords.find((record) => record.sys_id === sysId) || sampleRecords[0];
        return Promise.resolve({
          status: 200,
          data: {
            result: {
              ...existing,
              ...body,
              sys_id: sysId,
              sys_updated_on: "2026-02-28 22:00:00",
            },
          },
          headers: {},
          attempt: 1,
        });
      }

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleRecords;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleRecords.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleRecords.filter((record) => record.name === target);
      }
      if (sysparmQuery.includes("LIKE")) {
        const term = sysparmQuery.split("LIKE")[1]?.split("^")[0] || "";
        const normalized = String(term || "").toLowerCase();
        filtered = sampleRecords.filter((record) =>
          String(record.name || "").toLowerCase().includes(normalized) ||
          String(record.script || "").toLowerCase().includes(normalized) ||
          String(record.description || "").toLowerCase().includes(normalized),
        );
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_script_client")) {
      const sampleClientScripts = [
        {
          sys_id: "c1111111c2222222c3333333c4444444",
          name: "x_demo_client_script",
          script: "function onLoad(){ var gr = new GlideRecord('incident'); gr.query(); }",
          description: "Mock client script",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleClientScripts;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleClientScripts.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleClientScripts.filter((record) => record.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_ui_script")) {
      const sampleUiScripts = [
        {
          sys_id: "u1111111u2222222u3333333u4444444",
          name: "x_demo_ui_script",
          script: "function run(input){ return eval(input); }",
          description: "Mock UI script with critical pattern",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleUiScripts;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleUiScripts.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleUiScripts.filter((record) => record.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_script_fix")) {
      const sampleFixScripts = [
        {
          sys_id: "f1111111x2222222x3333333x4444444",
          name: "x_demo_fix_script",
          script: "var gr = new GlideRecord('incident'); gr.query();",
          description: "Mock fix script",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleFixScripts;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleFixScripts.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleFixScripts.filter((record) => record.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_script")) {
      const sampleBusinessRules = [
        {
          sys_id: "b1111111b2222222b3333333b4444444",
          name: "x_demo_business_rule",
          condition: "current.active == true",
          script: "if (current.short_description) { gs.info(current.short_description); }",
          description: "Mock business rule",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleBusinessRules;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleBusinessRules.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleBusinessRules.filter((record) => record.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/catalog_ui_policy")) {
      const sampleCatalogPolicies = [
        {
          sys_id: "p1111111p2222222p3333333p4444444",
          name: "x_demo_catalog_policy",
          script_true: "if (g_form.getValue('short_description')) { g_form.setMandatory('category', true); }",
          script_false: "g_form.setMandatory('category', false);",
          description: "Mock catalog policy",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleCatalogPolicies;
      if (sysparmQuery.startsWith("sys_id=")) {
        const target = sysparmQuery.replace("sys_id=", "");
        filtered = sampleCatalogPolicies.filter((record) => record.sys_id === target);
      }
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleCatalogPolicies.filter((record) => record.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_update_set")) {
      const sampleChangesets = [
        {
          sys_id: "a1111111b2222222c3333333d4444444",
          name: "u_demo_changeset",
          state: "in progress",
          application: "global",
          sys_created_on: "2026-03-01 01:00:00",
          sys_updated_on: "2026-03-01 01:15:00",
        },
        {
          sys_id: "b1111111c2222222d3333333e4444444",
          name: "u_demo_changeset_second",
          state: "complete",
          application: "x_demo_scope",
          sys_created_on: "2026-03-01 01:20:00",
          sys_updated_on: "2026-03-01 01:30:00",
        },
      ];

      const upperMethod = String(method).toUpperCase();
      if (upperMethod === "GET" && /\/sys_update_set\/[a-z0-9]+$/i.test(path)) {
        const sysId = path.split("/").pop();
        const record = sampleChangesets.find((entry) => entry.sys_id === sysId);
        if (!record) {
          return Promise.reject({
            code: "SN_RESOURCE_NOT_FOUND",
            message: "No Record found",
            status: 404,
            status_text: "Not Found",
            retriable: false,
            details: {
              instance: instance.instanceUrl,
              path,
              attempt: 1,
            },
          });
        }

        return Promise.resolve({
          status: 200,
          data: {
            result: record,
          },
          headers: {},
          attempt: 1,
        });
      }

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleChangesets;
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleChangesets.filter((entry) => entry.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_hub_flow")) {
      const sampleFlows = [
        {
          sys_id: "f1111111f2222222f3333333f4444444",
          name: "x_demo_incident_flow",
          description: "Sample flow for incident orchestration",
          status: "published",
          trigger_type: "record",
          steps: [{ id: "step_1", type: "action" }],
        },
        {
          sys_id: "f5555555f6666666f7777777f8888888",
          name: "x_demo_scheduled_flow",
          description: "",
          status: "active",
          trigger_type: "schedule",
          steps: [{ id: "step_1", type: "wait" }],
        },
      ];

      const upperMethod = String(method).toUpperCase();
      if (upperMethod === "GET" && /\/sys_hub_flow\/[a-z0-9]+$/i.test(path)) {
        const sysId = path.split("/").pop();
        const record = sampleFlows.find((entry) => entry.sys_id === sysId);
        if (!record) {
          return Promise.reject({
            code: "SN_RESOURCE_NOT_FOUND",
            message: "No Record found",
            status: 404,
            status_text: "Not Found",
            retriable: false,
            details: {
              instance: instance.instanceUrl,
              path,
              attempt: 1,
            },
          });
        }

        return Promise.resolve({
          status: 200,
          data: {
            result: record,
          },
          headers: {},
          attempt: 1,
        });
      }

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleFlows;
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleFlows.filter((entry) => entry.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/wf_workflow")) {
      const sampleWorkflows = [
        {
          sys_id: "w1111111w2222222w3333333w4444444",
          name: "x_demo_workflow",
          description: "Classic workflow sample",
          active: "true",
          activities: [{ id: "activity_1", type: "task" }],
        },
        {
          sys_id: "w5555555w6666666w7777777w8888888",
          name: "x_demo_wait_workflow",
          description: "",
          active: "true",
          activities: [{ id: "activity_1", type: "wait_timer" }],
        },
      ];

      const upperMethod = String(method).toUpperCase();
      if (upperMethod === "GET" && /\/wf_workflow\/[a-z0-9]+$/i.test(path)) {
        const sysId = path.split("/").pop();
        const record = sampleWorkflows.find((entry) => entry.sys_id === sysId);
        if (!record) {
          return Promise.reject({
            code: "SN_RESOURCE_NOT_FOUND",
            message: "No Record found",
            status: 404,
            status_text: "Not Found",
            retriable: false,
            details: {
              instance: instance.instanceUrl,
              path,
              attempt: 1,
            },
          });
        }

        return Promise.resolve({
          status: 200,
          data: {
            result: record,
          },
          headers: {},
          attempt: 1,
        });
      }

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleWorkflows;
      if (sysparmQuery.startsWith("name=")) {
        const target = sysparmQuery.replace("name=", "");
        filtered = sampleWorkflows.filter((entry) => entry.name === target);
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    if (path.includes("/sys_update_xml")) {
      const sampleEntries = [
        {
          sys_id: "x1111111x2222222x3333333x4444444",
          name: "sys_script_include_9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
          target_name: "x_demo_utility",
          target_table: "sys_script_include",
          target_sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
          action: "INSERT_OR_UPDATE",
          update_set: "a1111111b2222222c3333333d4444444",
        },
        {
          sys_id: "y1111111y2222222y3333333y4444444",
          name: "sys_properties_1234567890abcdef1234567890abcdef",
          target_name: "x.demo.property",
          target_table: "sys_properties",
          target_sys_id: "1234567890abcdef1234567890abcdef",
          action: "INSERT_OR_UPDATE",
          update_set: "b1111111c2222222d3333333e4444444",
        },
      ];

      const sysparmQuery = String(query.sysparm_query || "");
      let filtered = sampleEntries;
      if (sysparmQuery) {
        const clauses = sysparmQuery.split("^").filter(Boolean);
        for (const clause of clauses) {
          if (clause.startsWith("update_set=")) {
            const target = clause.replace("update_set=", "");
            filtered = filtered.filter((entry) => entry.update_set === target);
            continue;
          }
          if (clause.startsWith("update_set!=")) {
            const target = clause.replace("update_set!=", "");
            filtered = filtered.filter((entry) => entry.update_set !== target);
            continue;
          }
          if (clause.startsWith("target_table=")) {
            const target = clause.replace("target_table=", "");
            filtered = filtered.filter((entry) => entry.target_table === target);
            continue;
          }
          if (clause.startsWith("target_sys_id=")) {
            const target = clause.replace("target_sys_id=", "");
            filtered = filtered.filter((entry) => entry.target_sys_id === target);
            continue;
          }
          if (clause.startsWith("nameLIKE")) {
            const term = clause.replace("nameLIKE", "").toLowerCase();
            filtered = filtered.filter((entry) => String(entry.name || "").toLowerCase().includes(term));
          }
        }
      }

      const limit = Number(query.sysparm_limit || filtered.length || 1);
      const offset = Number(query.sysparm_offset || 0);
      const paged = filtered.slice(offset, offset + limit);

      return Promise.resolve({
        status: 200,
        data: {
          result: paged,
        },
        headers: {},
        attempt: 1,
      });
    }

    return Promise.resolve({
      status: 200,
      data: {
        result: [],
        mock: true,
        path,
        query,
        instance: instance.instanceUrl,
      },
      headers: {},
      attempt: 1,
    });
  }
}
