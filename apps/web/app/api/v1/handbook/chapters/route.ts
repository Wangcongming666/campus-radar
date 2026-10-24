import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { publicList } from '@/server/public';
export const GET = route(async (request) =>
  json({ data: (await publicList('chapters', new URL(request.url).searchParams)).data }),
);
