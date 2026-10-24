import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { exportMe } from '@/server/private';
export const POST = route(exportMe);
