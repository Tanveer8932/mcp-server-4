import type { CallToolResult } from "@modelcontextprotocol/server";
import { AppError } from "../../errors/codes.js";
import { errorResponse, successResponse } from "../../errors/envelope.js";
import { mapToAppError } from "../../errors/mapper.js";
import type { Logger } from "../../logging/logger.js";
import { createRequestContext } from "../../logging/requestContext.js";

export type ToolExecutionResult = Record<string, unknown>;

export async function executeTool<T extends ToolExecutionResult>(
  options: {
    action: string;
    logger: Logger;
    execute: () => Promise<T>;
    logFields?: Record<string, unknown>;
  },
): Promise<CallToolResult> {
  const ctx = createRequestContext(options.action);
  const start = Date.now();

  try {
    const result = await options.execute();
    const { status, ...fields } = result;
    const response = successResponse(options.action, String(status ?? "success"), fields);

    options.logger.info("Tool completed", {
      requestId: ctx.requestId,
      toolName: options.action,
      durationMs: Date.now() - start,
      resultStatus: "success",
      ...options.logFields,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      structuredContent: response,
    };
  } catch (error) {
    const appError = error instanceof AppError ? error : mapToAppError(error, options.action);
    const response = errorResponse(
      options.action,
      appError.code,
      appError.message,
      appError.retryable,
    );

    options.logger.error("Tool failed", {
      requestId: ctx.requestId,
      toolName: options.action,
      durationMs: Date.now() - start,
      resultStatus: "error",
      errorCode: appError.code,
      retryable: appError.retryable,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      structuredContent: response,
      isError: true,
    };
  }
}
