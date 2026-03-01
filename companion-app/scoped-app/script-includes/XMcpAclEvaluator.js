var XMcpAclEvaluator = Class.create();
XMcpAclEvaluator.prototype = {
  initialize: function () {},

  evaluate: function (params) {
    var input = params || {};
    var table = String(input.table || "");
    var operation = String(input.operation || "read");
    var field = input.field ? String(input.field) : "*";

    if (!table) {
      return {
        decision: "indeterminate",
        reasoning_summary: "Missing required field: table",
        evaluated_acls: []
      };
    }

    var acl = new GlideRecord("sys_security_acl");
    acl.addQuery("name", "CONTAINS", table);
    acl.addQuery("operation", operation);
    acl.setLimit(10);
    acl.query();

    var evaluated = [];
    while (acl.next()) {
      evaluated.push({
        sys_id: String(acl.getUniqueValue()),
        name: String(acl.getValue("name") || ""),
        operation: String(acl.getValue("operation") || ""),
        active: String(acl.getValue("active") || "")
      });
    }

    return {
      decision: evaluated.length > 0 ? "indeterminate" : "indeterminate",
      reasoning_summary:
        "Companion ACL evaluation currently returns metadata-backed deterministic output. Runtime scripted ACL execution context is intentionally conservative.",
      evaluated_acls: evaluated,
      context: {
        table: table,
        operation: operation,
        field: field
      }
    };
  },

  type: "XMcpAclEvaluator"
};
