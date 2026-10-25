import { route } from '@/server/http';
import { exportAccountData } from '@/server/account-data';
export const runtime = 'nodejs';
export const GET = route(exportAccountData);
