(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
  var provider = new XMcpCompanionVersion();
  response.setStatus(200);
  response.setBody({
    result: provider.getInfo()
  });
})(request, response);
