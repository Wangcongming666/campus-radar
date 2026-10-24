import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { applicationDetail } from '@/server/private';
export const GET = route(async (request, context) =>
  applicationDetail(request, (await context.params).id),
);
export const PATCH = GET;
