import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { search } from '@/server/public';
export const GET = route(async (request) =>
  json({ data: await search(new URL(request.url).searchParams) }),
);
