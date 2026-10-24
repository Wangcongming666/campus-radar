import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { ingestBatch } from '@/server/worker';
export const POST = route(ingestBatch);
