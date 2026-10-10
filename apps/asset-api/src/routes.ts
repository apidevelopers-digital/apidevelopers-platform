export const assetApiRoutes = [
  'POST /v1/assets',
  'POST /v1/assets/:id/process',
  'POST /v1/assets/:id/publish',
  'POST /v1/assets/:id/inject',
  'GET /v1/assets/:id/verify',
  'GET /v1/projects/:id/manifest',
  'POST /v1/hostinger/publish/archive',
  'POST /v1/hostinger/publish/:id/approve',
  'POST /v1/hostinger/publish/:id/execute',
  'GET /v1/hostinger/publish/:id',
  'POST /v1/hostinger/publish/:id/rollback',
] as const;

export type AssetApiRoute = typeof assetApiRoutes[number];
