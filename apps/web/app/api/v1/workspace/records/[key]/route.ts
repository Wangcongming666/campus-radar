import { route } from '@/server/http';
import { workspaceRecord } from '@/server/workspace';
export const runtime = 'nodejs';
const handle = route(async (request, context) =>
  workspaceRecord(request, (await context.params).key),
);
export const GET = handle;
export const PUT = handle;
