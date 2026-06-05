// /openapi.json — serves the OpenAPI 3.1 spec at the well-known /openapi.json path.
// MCP.so, Glama.ai, and Swagger expect this path; without it the spec is invisible.
module.exports = require('./openapi');
