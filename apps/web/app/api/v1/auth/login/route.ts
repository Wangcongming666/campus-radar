import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { login } from '@/server/auth';
export const POST = route(login);
