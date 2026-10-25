import { route } from '@/server/http';
import { workspace } from '@/server/workspace';
export const runtime = 'nodejs';
export const GET = route(workspace);
