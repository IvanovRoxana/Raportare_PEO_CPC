import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Table, AttributeType, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction, Code, type FunctionProps } from 'aws-cdk-lib/aws-lambda';

test('synthesized infrastructure bounds concurrency, encrypts queues and separates retries from attempts', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../amplify/eligibility/resources.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {} as typeof import('../amplify/eligibility/resources.ts');
  // Artifact bundling is checked separately. This test synthesizes actual CDK resources without installing Linux native modules.
  new Function('require', 'exports', compiled)((id: string) => id === 'aws-cdk-lib/aws-lambda-nodejs' ? {
    OutputFormat: { ESM: 'esm' },
    NodejsFunction: class extends LambdaFunction {
      constructor(scope: Stack, name: string, props: FunctionProps) {
        super(scope, name, { ...props, code: Code.fromInline('exports.handler = async () => {};'), handler: 'index.handler' });
      }
    },
  } : require(id), exported);
  const app = new App(), stack = new Stack(app, 'EligibilityTest', { env: { account: '111111111111', region: 'eu-central-1' } });
  const table = (name: string, stream = false) => new Table(stack, name, { partitionKey: { name: 'id', type: AttributeType.STRING },
    ...(stream ? { stream: StreamViewType.KEYS_ONLY } : {}) });
  exported.createEligibilityWorkers(stack, {
    tables: { Expert: table('Expert'), EligibilityEvaluationRun: table('Runs'), EligibilityEvaluationEvidence: table('Evidence') },
    runtime: table('Runtime', true), bucket: new Bucket(stack, 'Files'),
    ssrRole: new Role(stack, 'Ssr', { assumedBy: new ServicePrincipal('amplify.amazonaws.com') }),
    userPoolId: 'eu-central-1_test', clientId: 'client', userPoolArn: 'arn:aws:cognito-idp:eu-central-1:111111111111:userpool/eu-central-1_test',
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::SQS::Queue', { SqsManagedSseEnabled: true, VisibilityTimeout: 1800,
    RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }) });
  template.hasResourceProperties('AWS::Lambda::Function', { Timeout: 300, ReservedConcurrentExecutions: 3,
    Environment: { Variables: Match.objectLike({ ELIGIBILITY_OPENAI_KEY_PARAMETER: Match.anyValue() }) } });
  template.hasResourceProperties('AWS::Lambda::EventSourceMapping', { BatchSize: 1, FunctionResponseTypes: ['ReportBatchItemFailures'], ScalingConfig: { MaximumConcurrency: 3 } });
  template.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(1 minute)' });
  template.resourceCountIs('AWS::CloudWatch::Alarm', 6);
  const json = JSON.stringify(template.toJSON());
  assert.doesNotMatch(json, /"OPENAI_API_KEY"\s*:/);
  assert.match(json, /cognito-idp:AdminGetUser/);
  assert.match(json, /ssm:GetParameter/);
});
