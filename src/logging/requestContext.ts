import { randomUUID } from "node:crypto";

export type RequestContext = {
  requestId: string;
  toolName: string;
  principal?: string;
};

export function createRequestContext(toolName: string, principal?: string): RequestContext {
  return {
    requestId: `req_${randomUUID()}`,
    toolName,
    principal,
  };
}
