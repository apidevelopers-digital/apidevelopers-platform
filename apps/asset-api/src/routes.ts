export const assetApiRoutes = [
  'POST /v1/assets',
  'POST /v1/assets/:id/process',
  'POST /v1/assets/:id/publish',
  'POST /v1/assets/:id/inject',
  'GET /v1/assets/:id/verify',
  'GET /v1/projects/:id/manifest',
] as const;

export type AssetApiRoute = typeof assetApiRoutes[number];
