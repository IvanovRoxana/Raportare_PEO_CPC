import { Duration, Stack } from 'aws-cdk-lib';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, StartingPosition, FilterCriteria, FilterRule } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PolicyStatement, type IRole } from 'aws-cdk-lib/aws-iam';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { MetricFilter, FilterPattern } from 'aws-cdk-lib/aws-logs';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { join } from 'node:path';

export function createEligibilityWorkers(stack: Stack, options: {
  tables: Record<string, ITable>; runtime: ITable; bucket: IBucket; ssrRole: IRole;
  userPoolId: string; userPoolArn: string; clientId: string;
}) {
  const deadLetter = new Queue(stack, 'EligibilityDeadLetter', { encryption: QueueEncryption.SQS_MANAGED, enforceSSL: true, retentionPeriod: Duration.days(14) });
  const queue = new Queue(stack, 'EligibilityQueue', { encryption: QueueEncryption.SQS_MANAGED, enforceSSL: true,
    visibilityTimeout: Duration.minutes(30), retentionPeriod: Duration.days(4), deadLetterQueue: { queue: deadLetter, maxReceiveCount: 5 } });
  const tableNames = Object.fromEntries(Object.entries(options.tables).map(([name, table]) => [name, table.tableName]));
  const environment: Record<string, string> = {
    ELIGIBILITY_TABLES: JSON.stringify({ ...tableNames, EligibilityRuntime: options.runtime.tableName }),
    ELIGIBILITY_AWS_REGION: stack.region, ELIGIBILITY_BUCKET: options.bucket.bucketName,
    ELIGIBILITY_USER_POOL: options.userPoolId, ELIGIBILITY_CLIENT_ID: options.clientId,
  };
  const common = { runtime: Runtime.NODEJS_22_X, depsLockFilePath: join(process.cwd(), 'package-lock.json'),
    projectRoot: process.cwd(), environment, bundling: { format: OutputFormat.ESM,
      // server-only's react-server export is empty in this trusted server bundle.
      esbuildArgs: { '--conditions': 'react-server' }, externalModules: [] as string[],
      // Bundled CommonJS dependencies also need path globals during ESM cold starts.
      banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const __filename = require('node:url').fileURLToPath(import.meta.url); const __dirname = require('node:path').dirname(__filename);",
    } };
  const keyParameter = process.env.ELIGIBILITY_OPENAI_KEY_PARAMETER || '/peo/eligibility/openai-api-key';
  const aiEnvironment = Object.fromEntries([
    'OPENAI_MODEL', 'OPENAI_ELIGIBILITY_MODEL', 'OPENAI_EMBEDDING_MODEL', 'ELIGIBILITY_RULES_TIME_POLICY',
    'ELIGIBILITY_MAX_MODEL_CALLS', 'ELIGIBILITY_MAX_TOOL_CALLS', 'ELIGIBILITY_MAX_TOKENS', 'ELIGIBILITY_MAX_COST_USD',
    'ELIGIBILITY_TIMEOUT_MS', 'ELIGIBILITY_MAX_CONCURRENT', 'AI_DAILY_COST_LIMIT_USD', 'AI_MONTHLY_COST_LIMIT_USD',
  ].flatMap((name) => process.env[name] ? [[name, process.env[name]!]] : []));
  const worker = new NodejsFunction(stack, 'EligibilityWorker', { ...common,
    entry: join(process.cwd(), 'amplify/eligibility/worker.ts'), timeout: Duration.minutes(5), memorySize: 2048,
    // Limit SQS processing via maxConcurrency below without reserving account capacity.
    environment: { ...environment, ...aiEnvironment, ELIGIBILITY_OPENAI_KEY_PARAMETER: keyParameter },
    // PDF.js loads worker/native assets dynamically. The Amplify Linux build installs these.
    bundling: { ...common.bundling, nodeModules: ['pdfjs-dist'] },
  });
  worker.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true, maxConcurrency: 3 }));
  worker.addToRolePolicy(new PolicyStatement({ actions: ['ssm:GetParameter'],
    resources: [stack.formatArn({ service: 'ssm', resource: 'parameter', resourceName: keyParameter.replace(/^\//, '') })] }));
  if (process.env.ELIGIBILITY_OPENAI_KMS_KEY_ARN) worker.addToRolePolicy(new PolicyStatement({ actions: ['kms:Decrypt'], resources: [process.env.ELIGIBILITY_OPENAI_KMS_KEY_ARN] }));
  worker.addToRolePolicy(new PolicyStatement({ actions: ['cognito-idp:AdminGetUser', 'cognito-idp:AdminListGroupsForUser'], resources: [options.userPoolArn] }));
  for (const [name, table] of Object.entries(options.tables)) {
    if (['EligibilityEvaluationRun', 'EligibilityEvaluationEvidence'].includes(name)) table.grantReadWriteData(worker);
    else table.grantReadData(worker);
  }
  options.runtime.grantReadWriteData(worker);
  for (const prefix of ['deliverables/*', 'deliverable-index/*', 'projects/*', 'rag-originals/*', 'eligibility-private/*']) options.bucket.grantRead(worker, prefix);
  options.bucket.grantPut(worker, 'eligibility-private/extractions/*');

  const dispatcher = new NodejsFunction(stack, 'EligibilityDispatcher', { ...common,
    entry: join(process.cwd(), 'amplify/eligibility/dispatcher.ts'), timeout: Duration.minutes(1), memorySize: 512,
    environment: { ...environment, ELIGIBILITY_QUEUE_URL: queue.queueUrl },
  });
  options.runtime.grantReadWriteData(dispatcher);
  options.tables.EligibilityEvaluationRun.grantReadWriteData(dispatcher);
  queue.grantSendMessages(dispatcher);
  dispatcher.addEventSource(new DynamoEventSource(options.runtime, { startingPosition: StartingPosition.LATEST,
    batchSize: 10, retryAttempts: 2, bisectBatchOnError: true, reportBatchItemFailures: true,
    filters: [FilterCriteria.filter({ eventName: ['INSERT'], dynamodb: { Keys: { id: { S: FilterRule.beginsWith('job:') } } } })] }));
  new Rule(stack, 'EligibilityRecovery', { schedule: Schedule.rate(Duration.minutes(1)), targets: [new LambdaFunction(dispatcher)] });

  const alarms = new Topic(stack, 'EligibilityAlerts');
  const alarm = (id: string, metric: import('aws-cdk-lib/aws-cloudwatch').IMetric, threshold: number) => {
    const a = new Alarm(stack, id, { metric, threshold, evaluationPeriods: 1, comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING });
    a.addAlarmAction(new SnsAction(alarms));
  };
  alarm('EligibilityDeadLetters', deadLetter.metricApproximateNumberOfMessagesVisible(), 1);
  alarm('EligibilityQueueDelay', queue.metricApproximateAgeOfOldestMessage(), 600);
  alarm('EligibilityWorkerErrors', worker.metricErrors(), 1);
  alarm('EligibilityDispatcherErrors', dispatcher.metricErrors(), 1);
  const expired = new MetricFilter(stack, 'ExpiredJobsMetric', { logGroup: dispatcher.logGroup,
    filterPattern: FilterPattern.allTerms('ELIGIBILITY_JOB_EXPIRED'), metricNamespace: 'PEO/Eligibility', metricName: 'ExpiredJobs', metricValue: '1' });
  const failures = new MetricFilter(stack, 'AttemptFailuresMetric', { logGroup: worker.logGroup,
    filterPattern: FilterPattern.allTerms('ELIGIBILITY_JOB_ATTEMPT_FAILED'), metricNamespace: 'PEO/Eligibility', metricName: 'AttemptFailures', metricValue: '1' });
  alarm('EligibilityExpiredJobs', expired.metric({ statistic: 'Sum' }), 1);
  alarm('EligibilityAttemptFailures', failures.metric({ statistic: 'Sum' }), 3);
  return { queueUrl: queue.queueUrl, alertsTopicArn: alarms.topicArn, workerName: worker.functionName, keyParameter };
}
