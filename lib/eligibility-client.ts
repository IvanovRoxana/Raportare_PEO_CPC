'use client';
import { fetchAuthSession } from 'aws-amplify/auth';

export async function eligibilityRequest(path: string, body?: unknown) {
  const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  if (!token) throw new Error('Sesiunea Cognito lipseste.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operatia nu a putut fi finalizata.');
  return result;
}
