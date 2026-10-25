import { route } from '@/server/http';
import { importJobs } from '@/server/catalog-import';
export const runtime = 'nodejs';
export const POST = route(importJobs);
