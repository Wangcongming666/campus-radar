import { route } from '@/server/http';
import { files } from '@/server/files';
export const runtime = 'nodejs';
export const GET = route(files);
