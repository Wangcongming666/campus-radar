import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { logout } from '@/server/auth';
export const POST = route(logout);
