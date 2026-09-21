import outputs from '../amplify_outputs.json';

// Lambda receives deployment-time references; SSR retains Amplify's generated outputs.
export const eligibilityRegion = process.env.ELIGIBILITY_AWS_REGION || outputs.auth.aws_region;
export const eligibilityBucket = process.env.ELIGIBILITY_BUCKET || outputs.storage.bucket_name;
export const eligibilityUserPool = process.env.ELIGIBILITY_USER_POOL || outputs.auth.user_pool_id;
export const eligibilityClientId = process.env.ELIGIBILITY_CLIENT_ID || outputs.auth.user_pool_client_id;

export function eligibilityTables(): Record<string, string> {
  if (process.env.ELIGIBILITY_TABLES) return JSON.parse(process.env.ELIGIBILITY_TABLES);
  return (outputs as unknown as { custom?: { eligibilityTables?: Record<string, string> } }).custom?.eligibilityTables || {};
}
