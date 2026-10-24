import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { publicDetail } from '@/server/public';
export const GET = route(async (request, context) =>
  json({ data: await publicDetail('jobs', (await context.params).id) }),
);
