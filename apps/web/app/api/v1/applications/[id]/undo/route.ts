import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { undoApplication } from '@/server/private';
export const POST = route(async (request, context) =>
  undoApplication(request, (await context.params).id),
);
