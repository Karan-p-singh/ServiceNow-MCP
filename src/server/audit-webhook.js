function shouldSendEvent(filter, event) {
  const normalized = String(filter || "writes").toLowerCase();
  if (normalized === "all") {
    return true;
  }

  const isWrite = event?.write_operation === true;
  const highRisk =
    event?.tier === "T3" ||
    Number(event?.validation_summary?.findings_count_by_severity?.CRITICAL || 0) > 0 ||
    Number(event?.validation_summary?.findings_count_by_severity?.HIGH || 0) > 0;

  if (normalized === "high_risk") {
    return highRisk;
  }

  return isWrite;
}

export class AuditWebhookSink {
  constructor({ config, fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.config = config || {};
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  isEnabled() {
    return Boolean(this.config?.enabled && this.config?.url);
  }

  async send(event) {
    if (!this.isEnabled()) {
      return { sent: false, reason: "DISABLED" };
    }

    if (!shouldSendEvent(this.config?.filter, event)) {
      return { sent: false, reason: "FILTERED" };
    }

    if (typeof this.fetchImpl !== "function") {
      return { sent: false, reason: "NO_FETCH" };
    }

    const timeoutMs = Math.max(250, Number(this.config?.timeoutMs || 2000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchImpl(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "mcp.audit.webhook",
          sent_at: new Date().toISOString(),
          payload: event,
        }),
        signal: controller.signal,
      });

      return {
        sent: response.ok,
        status: response.status,
      };
    } catch (error) {
      this.logger.warn?.("[mcp] audit webhook send failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        sent: false,
        reason: "SEND_FAILED",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
