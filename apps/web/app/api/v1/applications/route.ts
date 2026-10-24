import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { applications } from '@/server/private';
export const GET = route(applications);
export const POST = route(applications);
