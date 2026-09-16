import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';

const backend = defineBackend({
  auth,
  data,
  storage,
});

const tableNames = ['Expert', 'Deliverable', 'Document', 'Activity', 'ActivityCatalog', 'KnowledgeDocument', 'KnowledgeChunk',
  'AiEligibilityRuleset', 'AiEligibilityRuleVersion', 'EligibilityEvaluationRun', 'EligibilityEvaluationEvidence', 'PmEligibilityDecision'] as const;
const tables: Record<string, ITable> = backend.data.resources.tables;
// The existing foundation bootstrap deliberately omits the eligibility models.
// Create the SSR role only once the complete schema is deployed.
if (tableNames.every((name) => tables[name])) {
  const eligibilityRole = new Role(backend.createStack('eligibility-server'), 'EligibilitySsrRole', {
    assumedBy: new ServicePrincipal('amplify.amazonaws.com'),
  });
  const writable = new Set<string>(['AiEligibilityRuleset', 'AiEligibilityRuleVersion', 'EligibilityEvaluationRun', 'EligibilityEvaluationEvidence', 'PmEligibilityDecision']);
  const eligibilityTables: Record<string, string> = {};
  for (const name of tableNames) {
    const table = tables[name];
    eligibilityTables[name] = table.tableName;
    eligibilityRole.addToPolicy(new PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:Scan', 'dynamodb:Query', ...(writable.has(name) ? ['dynamodb:PutItem', 'dynamodb:UpdateItem'] : [])],
      resources: [table.tableArn, `${table.tableArn}/index/*`],
    }));
  }
  backend.addOutput({ custom: { eligibilityTables, eligibilityComputeRoleArn: eligibilityRole.roleArn } });
  const filesBucket = backend.storage.resources.bucket;
  eligibilityRole.addToPolicy(new PolicyStatement({ actions: ['s3:GetObject'],
    resources: ['deliverables/*', 'deliverable-index/*', 'projects/*', 'rag-originals/*'].map((prefix) => filesBucket.arnForObjects(prefix)) }));
  eligibilityRole.addToPolicy(new PolicyStatement({ actions: ['s3:PutObject'], resources: [filesBucket.arnForObjects('rag-originals/*')] }));
}
