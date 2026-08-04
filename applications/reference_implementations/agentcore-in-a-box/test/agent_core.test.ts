import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { AgentCoreStack } from '../lib/agent_core-stack';

// Smoke test: synthesize the stack and assert the core resources exist.
// Runs without any AWS credentials or account context.
function synth(): Template {
  const app = new cdk.App();
  const stack = new AgentCoreStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-west-2' },
  });
  return Template.fromStack(stack);
}

test('creates a Cognito user pool', () => {
  synth().resourceCountIs('AWS::Cognito::UserPool', 1);
});

test('creates the WebSocket chat API with its three routes', () => {
  const t = synth();
  t.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'WEBSOCKET' });
  for (const routeKey of ['$connect', '$disconnect', 'sendMessage']) {
    t.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: routeKey });
  }
  // 3 WebSocket ($connect, $disconnect, sendMessage)
  // + 6 default-HTTP-API routes (POST /policy/toggle, GET /observability, GET /trace,
  //   GET /oauth/callback, GET+POST /bonds/{action})
  // + 5 admin-RBAC routes (GET+POST /admin/{proxy+}, GET /me/entitlements,
  //   GET+POST /me/access-requests). NOTE: /admin/graph and /admin/access-requests* are served
  //   under the /admin/{proxy+} catch-all, so they add NO extra route resource here.
  // + 2 Grades API routes (GET /grades, PUT /grades/{category})
  // + 1 Market-Data API route (GET /market/{dataset})
  // + 12 AgentCore ops-plane routes (GET /evaluations, POST /evaluations/run, GET /registry,
  //   POST /registry/search, POST /registry/curate, GET /harness, GET /harness/versions,
  //   POST /harness/endpoint, POST /harness/invoke, GET /optimization,
  //   POST /optimization/recommend, POST /optimization/experiment) = 29 total.
  t.resourceCountIs('AWS::ApiGatewayV2::Route', 29);
});

test('creates the Grades API resource server, table, and lambda', () => {
  const t = synth();
  t.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', { Identifier: 'portfolio-api' });
  t.hasResourceProperties('AWS::DynamoDB::Table', { TableName: 'agentcore-demo-grades' });
  const fns = t.findResources('AWS::Lambda::Function');
  const names = Object.values(fns).map((f: any) => f.Properties?.FunctionName).filter(Boolean);
  expect(names).toContain('agentcore-demo-grades-api');
});

test('creates the M2M market-data resource server, client_credentials client, and lambda', () => {
  const t = synth();
  t.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', { Identifier: 'market-data' });
  t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AllowedOAuthFlows: ['client_credentials'],
    GenerateSecret: true,
  });
  const fns = t.findResources('AWS::Lambda::Function');
  const names = Object.values(fns).map((f: any) => f.Properties?.FunctionName).filter(Boolean);
  expect(names).toContain('agentcore-demo-market-data-api');
});

test('creates the ECR repository for the agent container', () => {
  synth().hasResourceProperties('AWS::ECR::Repository', {
    RepositoryName: 'agentcore-demo-agent',
  });
});

test('creates the websocket and policy-toggle lambdas, but no proxy lambda', () => {
  const t = synth();
  const fns = t.findResources('AWS::Lambda::Function');
  const names = Object.values(fns)
    .map((f: any) => f.Properties?.FunctionName)
    .filter(Boolean);
  expect(names).toContain('agentcore-demo-websocket');
  expect(names).toContain('agentcore-demo-policy-toggle');
  expect(names).not.toContain('agentcore-demo-proxy');
});

test('creates the AgentCore ops-plane primitives lambda (Evaluations/Registry/Harness/Optimization)', () => {
  const t = synth();
  const fns = t.findResources('AWS::Lambda::Function');
  const names = Object.values(fns).map((f: any) => f.Properties?.FunctionName).filter(Boolean);
  expect(names).toContain('agentcore-demo-primitives');
});

test('creates the entitlements expiry sweeper lambda on a 1-minute schedule (JIT-grant revocation)', () => {
  const t = synth();
  const fns = t.findResources('AWS::Lambda::Function');
  const names = Object.values(fns).map((f: any) => f.Properties?.FunctionName).filter(Boolean);
  expect(names).toContain('agentcore-demo-entitlements-sweeper');
  // The sweeper is driven by an EventBridge rate rule so a lapsed grant greys out live.
  t.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(1 minute)' });
});

test('grants the websocket lambda read on the entitlements table (desk connect-gate)', () => {
  const t = synth();
  // The desk connect-gate reads the caller's grants; the WS lambda role must carry a DDB read
  // action. We assert an IAM policy exists granting a Query/GetItem on some resource (the CDK
  // grantReadData). This is a coarse guard against the grant being dropped.
  const policies = t.findResources('AWS::IAM::Policy');
  const hasDdbRead = Object.values(policies).some((p: any) =>
    (p.Properties?.PolicyDocument?.Statement || []).some((s: any) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.some((a: string) => typeof a === 'string' && a.startsWith('dynamodb:'));
    }),
  );
  expect(hasDdbRead).toBe(true);
});

test('grants the admin-api lambda CloudWatch Logs Insights read (audit-trail reader)', () => {
  const t = synth();
  // The GET /admin/audit reader (lambda/admin-api/audit.py) queries the runtime's AUDIT log
  // lines via Logs Insights. Its role must carry logs:StartQuery/GetQueryResults — a coarse
  // guard that the read grant isn't dropped (an audit panel silently 500s without it).
  const policies = t.findResources('AWS::IAM::Policy');
  const hasLogsInsights = Object.values(policies).some((p: any) =>
    (p.Properties?.PolicyDocument?.Statement || []).some((s: any) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes('logs:StartQuery') && actions.includes('logs:GetQueryResults');
    }),
  );
  expect(hasLogsInsights).toBe(true);
});
