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
    try {
      const pluginPage = await this.listTable({
        table: "sys_plugins",
        limit: 10,
        offset: 0,
        instanceKey,
      });
      plugins = pluginPage.records
        .map((record) => record.name || record.id || record.sys_id)
        .filter(Boolean);
      pluginProbe = { table: "sys_plugins", status: "ok", plugin_count: plugins.length };
    } catch (error) {
      pluginProbe = {
        table: "sys_plugins",
        status: "failed",
        error: isObject(error) ? error : { message: String(error) },
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

  mockRequest({ path, query = {}, instance }) {
    if (path.includes("/sys_plugins")) {
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
      ];

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

      return Promise.resolve({
        status: 200,
        data: {
          result: filtered,
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
