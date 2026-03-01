(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
  var body = request.body && request.body.data ? request.body.data : {};
  var evaluator = new XMcpAclEvaluator();
  var result = evaluator.evaluate(body);

  response.setStatus(200);
  response.setBody({
    result: result
  });
})(request, response);
