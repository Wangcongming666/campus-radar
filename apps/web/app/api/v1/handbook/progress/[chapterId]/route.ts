import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { progress } from '@/server/private';
export const GET = route(async (request, context) =>
  progress(request, (await context.params).chapterId),
);
export const PUT = GET;
