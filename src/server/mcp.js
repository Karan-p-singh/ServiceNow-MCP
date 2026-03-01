import { createRequestContext } from "./request-context.js";
import { ToolRegistry } from "./tool-registry.js";

const TIER_ORDER = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

const REDACTED_KEYS = ["password", "secret", "token", "authorization", "client_secret"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const copy = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const isSensitive = REDACTED_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive));
    copy[key] = isSensitive ? "[REDACTED]" : redactValue(entryValue);
  }
  return copy;
}

function normalizeTier(tier) {
  const normalized = String(tier || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(TIER_ORDER, normalized) ? normalized : "T0";
}

function isWriteLikeTool(tool) {
  return normalizeTier(tool?.tier) !== "T0";
}

function evaluatePolicy({ tool, input, config }) {
  const decisions = [];
  let allowed = true;

  const toolName = tool?.name || "unknown";
  const scope = input?.scope || input?.target_scope || input?.artifact_scope || "global";
  const allowlisted = (config?.exceptionAllowlist || []).includes(toolName);
  const isWrite = isWriteLikeTool(tool);

  if (isWrite && Array.isArray(config?.allowedScopes) && config.allowedScopes.length > 0) {
    const scopeAllowed = config.allowedScopes.includes(scope);
    decisions.push({
      check: "allowed_scopes",
      passed: scopeAllowed || allowlisted,
      details: { scope, allowed_scopes: config.allowedScopes, exception_allowlisted: allowlisted },
    });
    if (!scopeAllowed && !allowlisted) {
      allowed = false;
    }
  }

  if (isWrite && config?.denyGlobalWrites) {
    const passed = scope !== "global" || allowlisted;
    decisions.push({
      check: "deny_global_writes",
      passed,
      details: { scope, exception_allowlisted: allowlisted },
    });
    if (!passed) {
      allowed = false;
    }
  }

  if (isWrite && config?.enforceChangesetScope && config?.changesetScope) {
    const passed = scope === config.changesetScope || allowlisted;
    decisions.push({
      check: "enforce_changeset_scope",
      passed,
      details: {
        scope,
        changeset_scope: config.changesetScope,
        exception_allowlisted: allowlisted,
      },
    });
    if (!passed) {
      allowed = false;
    }
  }

  const breakGlassRequested = input?.break_glass === true;
  const breakGlassReason = String(input?.break_glass_reason || input?.reason || "").trim();
  if (!allowed && breakGlassRequested) {
    const passed = config?.breakGlassEnabled && breakGlassReason.length > 0;
    decisions.push({
      check: "break_glass",
      passed,
      details: {
        requested: true,
        enabled: Boolean(config?.breakGlassEnabled),
        reason_present: breakGlassReason.length > 0,
      },
    });

    if (passed) {
      allowed = true;
    }
  }

  return {
    evaluated: true,
    allowed,
    decisions,
  };
}

function defaultPolicy() {
  return {
    evaluated: false,
    decisions: [],
  };
}

function defaultValidationSummary() {
  return {
    findings_count_by_severity: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
    blocked: false,
  };
}

function normalizeToolOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      data: output,
      policy: defaultPolicy(),
      validation_summary: defaultValidationSummary(),
      errors: [],
    };
  }

  const hasEnvelopeLikeFields =
    Object.prototype.hasOwnProperty.call(output, "data") ||
    Object.prototype.hasOwnProperty.call(output, "policy") ||
    Object.prototype.hasOwnProperty.call(output, "validation_summary") ||
    Object.prototype.hasOwnProperty.call(output, "errors");

  if (!hasEnvelopeLikeFields) {
    return {
      data: output,
      policy: defaultPolicy(),
      validation_summary: defaultValidationSummary(),
      errors: [],
    };
  }

  return {
    data: output.data ?? null,
    policy: output.policy ?? defaultPolicy(),
    validation_summary: output.validation_summary ?? defaultValidationSummary(),
    errors: Array.isArray(output.errors) ? output.errors : [],
  };
}

function buildEnvelope({ requestContext, config, tool, output }) {
  return {
    request_id: requestContext.request_id,
    correlation_id: requestContext.correlation_id,
    instance: config?.instanceUrl,
    edition: config?.edition,
    tool: tool.name,
    tier: tool.tier,
    policy: output.policy,
    validation_summary: output.validation_summary,
    data: output.data,
    errors: output.errors,
  };
}

function createAuditEvent({ stage, requestContext, tool, config, input, policy, validationSummary, errors }) {
  return redactValue({
    event_type: "mcp.audit",
    stage,
    timestamp: new Date().toISOString(),
    request_id: requestContext.request_id,
    correlation_id: requestContext.correlation_id,
    instance: config?.instanceUrl,
    edition: config?.edition,
    tool: tool?.name,
    tier: tool?.tier,
    write_operation: isWriteLikeTool(tool),
    input: input || {},
    policy: policy || defaultPolicy(),
    validation_summary: validationSummary || defaultValidationSummary(),
    error_count: Array.isArray(errors) ? errors.length : 0,
    errors: errors || [],
  });
}

export class MCPServer {
  constructor({ config, logger = console } = {}) {
    this.config = config;
    this.logger = logger;
    this.registry = new ToolRegistry();
    this.started = false;
  }

  registerTool(tool) {
    this.registry.register(tool);
  }

  listTools() {
    return this.registry.list();
  }

  async start() {
    this.started = true;
    this.logger.info?.("[mcp] server started", {
      edition: this.config?.edition,
      tier_max: this.config?.tierMax,
      instance: this.config?.instanceUrl,
      tools_registered: this.listTools().length,
    });
  }

  async stop() {
    this.started = false;
    this.logger.info?.("[mcp] server stopped");
  }

  async invoke(toolName, input = {}) {
    if (!this.started) {
      throw new Error("MCP server is not started");
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const requestContext = createRequestContext(input);
    const runtimeContext = {
      request: requestContext,
      config: this.config,
      tool: {
        name: tool.name,
        tier: tool.tier,
      },
    };

    this.logger.info?.("[mcp] invoke", {
      request_id: requestContext.request_id,
      correlation_id: requestContext.correlation_id,
      tool: tool.name,
      tier: tool.tier,
    });

    const normalizedTier = normalizeTier(tool.tier);
    const normalizedTierMax = normalizeTier(this.config?.tierMax);

    if (TIER_ORDER[normalizedTier] > TIER_ORDER[normalizedTierMax]) {
      const policy = {
        evaluated: true,
        allowed: false,
        decisions: [
          {
            check: "tier_max",
            passed: false,
            details: {
              tool_tier: normalizedTier,
              tier_max: normalizedTierMax,
              reason: "Tool tier exceeds configured tier_max",
            },
          },
        ],
      };

      const envelope = buildEnvelope({
        requestContext,
        config: this.config,
        tool,
        output: {
          data: null,
          policy,
          validation_summary: defaultValidationSummary(),
          errors: [
            {
              code: "TIER_MAX_EXCEEDED",
              message: `Tool ${tool.name} (${normalizedTier}) exceeds configured tier_max (${normalizedTierMax})`,
            },
          ],
        },
      });

      this.logger.warn?.("[mcp] tier blocked", createAuditEvent({
        stage: "preflight_tier_block",
        requestContext,
        tool,
        config: this.config,
        input,
        policy,
        validationSummary: envelope.validation_summary,
        errors: envelope.errors,
      }));

      return envelope;
    }

    if (normalizedTier === "T3") {
      const confirm = input?.confirm === true;
      const reason = String(input?.reason || "").trim();
      if (!confirm || reason.length === 0) {
        const policy = {
          evaluated: true,
          allowed: false,
          decisions: [
            {
              check: "t3_confirm_reason",
              passed: false,
              details: {
                confirm_provided: confirm,
                reason_present: reason.length > 0,
              },
            },
          ],
        };

        const envelope = buildEnvelope({
          requestContext,
          config: this.config,
          tool,
          output: {
            data: null,
            policy,
            validation_summary: defaultValidationSummary(),
            errors: [
              {
                code: "T3_CONFIRMATION_REQUIRED",
                message: "T3 tools require confirm=true and a non-empty reason",
              },
            ],
          },
        });

        this.logger.warn?.("[mcp] t3 blocked", createAuditEvent({
          stage: "preflight_t3_block",
          requestContext,
          tool,
          config: this.config,
          input,
          policy,
          validationSummary: envelope.validation_summary,
          errors: envelope.errors,
        }));

        return envelope;
      }
    }

    const policy = evaluatePolicy({ tool, input, config: this.config });
    if (!policy.allowed) {
      const envelope = buildEnvelope({
        requestContext,
        config: this.config,
        tool,
        output: {
          data: null,
          policy,
          validation_summary: defaultValidationSummary(),
          errors: [
            {
              code: "POLICY_BLOCKED",
              message: "Invocation blocked by policy engine",
            },
          ],
        },
      });

      this.logger.warn?.("[mcp] policy blocked", createAuditEvent({
        stage: "preflight_policy_block",
        requestContext,
        tool,
        config: this.config,
        input,
        policy,
        validationSummary: envelope.validation_summary,
        errors: envelope.errors,
      }));

      return envelope;
    }

    this.logger.info?.("[mcp] audit", createAuditEvent({
      stage: "pre_handler",
      requestContext,
      tool,
      config: this.config,
      input,
      policy,
      validationSummary: defaultValidationSummary(),
      errors: [],
    }));

    try {
      const handlerOutput = await tool.handler(input, runtimeContext);
      const normalizedOutput = normalizeToolOutput(handlerOutput);
      const mergedPolicy = {
        evaluated: Boolean(policy?.evaluated || normalizedOutput?.policy?.evaluated),
        allowed:
          normalizedOutput?.policy?.allowed !== undefined
            ? normalizedOutput.policy.allowed
            : policy?.allowed,
        decisions: [
          ...(policy?.decisions || []),
          ...(normalizedOutput?.policy?.decisions || []),
        ],
      };
      normalizedOutput.policy = mergedPolicy;

      const envelope = buildEnvelope({
        requestContext,
        config: this.config,
        tool,
        output: normalizedOutput,
      });

      this.logger.info?.("[mcp] audit", createAuditEvent({
        stage: "post_handler_success",
        requestContext,
        tool,
        config: this.config,
        input,
        policy: envelope.policy,
        validationSummary: envelope.validation_summary,
        errors: envelope.errors,
      }));

      return envelope;
    } catch (error) {
      this.logger.error?.("[mcp] invoke failed", {
        request_id: requestContext.request_id,
        correlation_id: requestContext.correlation_id,
        tool: tool.name,
        tier: tool.tier,
        error: error instanceof Error ? error.message : String(error),
      });

      const envelope = buildEnvelope({
        requestContext,
        config: this.config,
        tool,
        output: {
          data: null,
          policy,
          validation_summary: defaultValidationSummary(),
          errors: [
            {
              code: "TOOL_INVOCATION_FAILED",
              message: error instanceof Error ? error.message : "Unknown tool error",
            },
          ],
        },
      });

      this.logger.error?.("[mcp] audit", createAuditEvent({
        stage: "post_handler_failure",
        requestContext,
        tool,
        config: this.config,
        input,
        policy: envelope.policy,
        validationSummary: envelope.validation_summary,
        errors: envelope.errors,
      }));

      return envelope;
    }
  }
}
