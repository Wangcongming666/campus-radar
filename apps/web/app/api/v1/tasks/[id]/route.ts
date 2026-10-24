import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { task } from '@/server/private';
export const GET = route(async (request, context) => task(request, (await context.params).id));
