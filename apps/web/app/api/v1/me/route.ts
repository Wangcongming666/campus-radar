import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { me } from '@/server/private';
export const GET = route(me);
export const PATCH = route(me);
export const DELETE = route(me);
