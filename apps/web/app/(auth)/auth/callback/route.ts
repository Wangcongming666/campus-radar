import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { callback } from '@/server/auth';
export const GET = route(callback);
