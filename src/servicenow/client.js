const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

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

  async listChangesets({ limit = 25, offset = 0, query = "", instanceKey } = {}) {
    return this.listTable({
      table: "sys_update_set",
      limit,
      offset,
      query,
      instanceKey,
    });
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
