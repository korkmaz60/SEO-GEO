import { Controller, Delete, Get, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@seo-geo/contracts";
import type { Response } from "express";

import { CurrentPrincipal, RequireScope } from "../auth/decorators.js";
import type { AuthenticatedRequest, Principal } from "../auth/principal.js";
import { ProblemException } from "../common/problem.exception.js";
import { McpService } from "./mcp.service.js";

/**
 * MCP over Streamable HTTP at `/api/v1/mcp`, stateless: every JSON-RPC message is a `POST`
 * answered with JSON. Clients authenticate with an API key (`x-api-key` or
 * `Authorization: Bearer sg_…`); each tool checks the key's workspace and scopes.
 */
@ApiTags("mcp")
@Controller("mcp")
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  // Connecting needs `read`; tools that change or spend check their own scope.
  @RequireScope("read")
  @ApiOperation({ summary: "MCP endpoint (Streamable HTTP, JSON responses, no sessions)" })
  async handle(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    if (!principal.apiKey) {
      throw new ProblemException({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.Unauthorized,
        detail: "Use an API key: x-api-key or Authorization: Bearer sg_….",
      });
    }
    const server = this.mcp.createServer(principal);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }

  @Get()
  @ApiOperation({ summary: "Not supported: this server sends no event streams" })
  stream(): never {
    throw methodNotAllowed();
  }

  @Delete()
  @ApiOperation({ summary: "Not supported: this server keeps no sessions" })
  end(): never {
    throw methodNotAllowed();
  }
}

function methodNotAllowed(): ProblemException {
  return new ProblemException({
    status: HttpStatus.METHOD_NOT_ALLOWED,
    code: "method_not_allowed",
    detail: "Send MCP messages with POST.",
  });
}
