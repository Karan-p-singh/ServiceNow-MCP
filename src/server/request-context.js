let invocationCounter = 0;

function nextInvocationId() {
  invocationCounter += 1;
  return String(invocationCounter).padStart(6, "0");
}

export function createRequestContext(input = {}) {
  const correlationId = input.correlation_id || `corr-${nextInvocationId()}`;
  const requestId = input.request_id || `req-${nextInvocationId()}`;

  return {
    request_id: requestId,
    correlation_id: correlationId,
    created_at: new Date().toISOString(),
  };
}
