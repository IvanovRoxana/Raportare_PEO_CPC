'use client';

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '@/amplify_outputs.json';
import type { Schema } from '@/amplify/data/resource';

let configured = false;
let dataClient: ReturnType<typeof generateClient<Schema>> | null = null;

export function configureAmplify() {
  if (!configured) {
    Amplify.configure(outputs, { ssr: true });
    configured = true;
  }
}

export function getAwsDataClient() {
  configureAmplify();
  if (!dataClient) {
    dataClient = generateClient<Schema>();
  }
  return dataClient;
}

export function isAwsAvailable() {
  return Boolean(outputs?.auth?.user_pool_id && outputs?.data?.url);
}
