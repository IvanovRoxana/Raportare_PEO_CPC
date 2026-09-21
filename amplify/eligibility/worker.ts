import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// Reuse the deployment's existing OpenAI key, held in an encrypted parameter.
// Never put a plaintext key in CDK templates, job rows, messages or outputs.
export async function handler(event: { Records: Array<{ messageId: string; body: string }> }) {
  if (!process.env.OPENAI_API_KEY) {
    const value = await new SSMClient({ maxAttempts: 2 }).send(new GetParameterCommand({
      Name: process.env.ELIGIBILITY_OPENAI_KEY_PARAMETER!, WithDecryption: true,
    }));
    if (!value.Parameter?.Value) throw new Error('OPENAI_API_KEY_MISSING');
    process.env.OPENAI_API_KEY = value.Parameter.Value;
  }
  const { eligibilityWorkerHandler } = await import('../../lib/eligibility-worker');
  return eligibilityWorkerHandler(event);
}
