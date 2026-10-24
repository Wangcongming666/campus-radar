import { route, json } from '@/server/http';
export const runtime = 'nodejs';
import { favoriteMutation } from '@/server/private';
export const PUT = route(async (request, context) => {
  const { type, targetId } = await context.params;
  return favoriteMutation(request, type, targetId);
});
export const DELETE = PUT;
