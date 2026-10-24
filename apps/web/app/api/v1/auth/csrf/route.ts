import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { csrf } from '@/server/auth';
export const GET = route(csrf);
