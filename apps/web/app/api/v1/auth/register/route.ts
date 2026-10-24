import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { register } from '@/server/auth';
export const POST = route(register);
