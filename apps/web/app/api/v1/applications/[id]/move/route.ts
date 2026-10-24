import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { moveApplication } from '@/server/private';
export const POST = route(async (request, context) =>
  moveApplication(request, (await context.params).id),
);
