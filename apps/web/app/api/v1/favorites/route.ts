import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { favorites } from '@/server/private';
export const GET = route(favorites);
