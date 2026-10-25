import { route, json, dataMode, ApiError } from '@/server/http';
import { databaseCatalog } from '@/server/catalog';
export const runtime = 'nodejs';
export const GET = route(async () => {
  if (dataMode() !== 'api') throw new ApiError(404, 'NOT_FOUND', '此目录仅供云端模式使用。');
  return json({ data: await databaseCatalog() });
});
