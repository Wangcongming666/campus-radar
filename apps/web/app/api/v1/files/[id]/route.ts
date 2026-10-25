import { route } from '@/server/http';
import { privateFile } from '@/server/files';
export const runtime = 'nodejs';
const handle = route(async (request, context) => privateFile(request, (await context.params).id));
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
