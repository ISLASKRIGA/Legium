// Redirects legacy imports to insforgeClient
export * from './insforgeClient';
// Alias for legacy callers
export { uploadPdfToInsforge as uploadPdfToSupabase } from './insforgeClient';
export { isInsforgeConfigured as isSupabaseConfigured } from './insforgeClient';
