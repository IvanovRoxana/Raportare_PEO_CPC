import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Table, AttributeType, BillingMode, type ITable } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

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
  // Private runtime records are never exposed through the client AppSync schema.
  const eligibilityRuntime = new Table(backend.createStack('eligibility-runtime'), 'Runtime', {
    partitionKey: { name: 'id', type: AttributeType.STRING }, billingMode: BillingMode.PAY_PER_REQUEST,
    pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: RemovalPolicy.RETAIN,
  });
  eligibilityRuntime.grantReadWriteData(eligibilityRole);
  eligibilityTables.EligibilityRuntime = eligibilityRuntime.tableName;
  backend.addOutput({ custom: { eligibilityTables, eligibilityComputeRoleArn: eligibilityRole.roleArn } });
  const filesBucket = backend.storage.resources.bucket;
  eligibilityRole.addToPolicy(new PolicyStatement({ actions: ['s3:GetObject'],
    resources: ['deliverables/*', 'deliverable-index/*', 'projects/*', 'rag-originals/*', 'eligibility-private/*'].map((prefix) => filesBucket.arnForObjects(prefix)) }));
  eligibilityRole.addToPolicy(new PolicyStatement({ actions: ['s3:PutObject'], resources: [filesBucket.arnForObjects('rag-originals/*'), filesBucket.arnForObjects('eligibility-private/*')] }));
}
