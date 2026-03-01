var XMcpCompanionVersion = Class.create();
XMcpCompanionVersion.prototype = {
  initialize: function () {},

  getInfo: function () {
    return {
      status: "ok",
      version: "1.0.0",
      app_scope: "x_mcp_companion",
      family: "Zurich"
    };
  },

  type: "XMcpCompanionVersion"
};
