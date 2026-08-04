import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

export interface AgentCoreStackProps extends cdk.StackProps {
  /** Optional environment suffix for parallel deploys (e.g. "test"). Empty = live. */
  demoEnv?: string;
}

export class AgentCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AgentCoreStackProps) {
    super(scope, id, props);

    // Suffix appended to every physical resource name when deploying a parallel
    // ("green") environment. Empty string → names are identical to the live stack.
    const env = props?.demoEnv ?? '';
    const sfx = (name: string) => (env ? `${name}-${env}` : name);
    // Some names use underscores (AgentCore runtime-style) — keep that convention.
    const usfx = (name: string) => (env ? `${name}_${env}` : name);

    // ---- CORS allowed origin (locked to the CloudFront domain) ----------------------------
    // The CloudFront distribution domain isn't known at synth time, so at bootstrap CORS is
    // permissive ('*') and deploy.sh re-locks every HTTP API + the AG-UI Function URL to the
    // real CloudFront origin post-deploy (it already did this for the AG-UI ALLOWED_ORIGIN;
    // that pattern is extended to API Gateway CORS). If CORS_ALLOWED_ORIGIN is supplied at
    // synth (context `-c corsAllowedOrigin=...` or env), we bake it in and skip the '*' phase.
    // allowHeaders is restricted to exactly the headers the SPA sends (Authorization +
    // Content-Type) plus the x-meridian-* / x-amzn-* headers the AG-UI path uses.
    const corsAllowedOrigin =
      this.node.tryGetContext('corsAllowedOrigin') || process.env.CORS_ALLOWED_ORIGIN || '*';
    const corsAllowOrigins = [corsAllowedOrigin];
    // API Gateway (httpApi/gradesApi/marketApi) callers only send these two request headers.
    const apiCorsHeaders = ['authorization', 'content-type'];

    // ========== COGNITO ==========
    const userPool = new cognito.UserPool(this, 'AgentCoreDemoUserPool', {
      userPoolName: sfx('agentcore-demo-users'),
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Hardened password policy: >=12 chars with upper/lower/digit required. Symbols are
      // NOT required so the documented demo password (letters+digits) stays valid — PROD
      // should also requireSymbols: true.
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      // MFA OPTIONAL (not OFF): the pillar is present and users CAN enroll TOTP, but it does
      // not block a quick live-demo login. PROD SHOULD SET mfa: cognito.Mfa.REQUIRED.
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      // TODO(prod): enable Cognito threat protection (compromised-credential + adaptive-auth
      // risk detection). NOT enabled here because it now requires the paid PLUS feature plan
      // (per-MAU billing) and the old `advancedSecurityMode` prop is deprecated — turning it on
      // would add cost to a demo account. PROD should set featurePlan: FeaturePlan.PLUS +
      // standardThreatProtectionMode: ENFORCED.
      // DEMO: DESTROY so teardown works. PROD SHOULD USE RETAIN + deletionProtection to avoid
      // wiping the user directory on a stack delete.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Public SPA client for the Hosted UI authorization-code + PKCE flow. The real
    // CloudFront callback/logout URLs are registered by deploy.sh (the distribution
    // domain isn't known at synth time); the placeholder lets it synth with code
    // flow + scopes enabled. userPassword kept for CLI/test token fetches.
    const userPoolClient = new cognito.UserPoolClient(this, 'AgentCoreDemoClient', {
      userPool,
      userPoolClientName: sfx('agentcore-demo-web'),
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      // Explicit, short token lifetimes (were Cognito defaults of 60m/60m/30d). Access + ID
      // tokens expire in 60 min; the refresh token in 1 day — long enough for a demo session,
      // short enough that a leaked refresh token isn't a month-long credential. PROD should
      // tune per risk appetite (and pair with token revocation, enabled by default).
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(1),
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['https://example.com/placeholder-callback'],
        logoutUrls: ['https://example.com/placeholder-logout'],
      },
    });

    // ---- AgentCore Identity: Grades resource server + OAuth client ----
    // A hosted-UI domain is required for the 3-legged (USER_FEDERATION) consent
    // redirect. Suffix with the account id to keep the global domain prefix unique.
    const domainPrefix = env ? `agentcore-demo-${env}-${this.account}` : `agentcore-demo-${this.account}`;
    const userPoolDomain = new cognito.UserPoolDomain(this, 'AgentCoreDomain', {
      userPool,
      cognitoDomain: { domainPrefix },
      // Managed Login v2 — required for the custom branding (logo / background /
      // favicon / colors) applied below. Classic Hosted UI (v1) has no branding API.
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Custom Managed Login branding (AgentCore teal logo, artsy background, favicon,
    // brand colors) captured from the designed login page in branding/. This makes
    // the login screen reproducible on every fresh deploy instead of defaulting to
    // the stock Cognito page. Settings + assets are exported via:
    //   aws cognito-idp describe-managed-login-branding-by-client --return-merged-resources
    // and re-shaped to the CFN camelCase form (see branding/*.json).
    const brandingDir = path.join(__dirname, '../branding');
    const brandingSettings = JSON.parse(fs.readFileSync(path.join(brandingDir, 'cfn-settings.json'), 'utf8'));
    const brandingAssets = JSON.parse(fs.readFileSync(path.join(brandingDir, 'cfn-assets.json'), 'utf8'));
    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: false,
      settings: brandingSettings,
      assets: brandingAssets,
    });

    // The Portfolio API is a distinct resource server with its own scopes. The
    // delegated token the agent vends is audience-scoped to THESE scopes — that is
    // what makes it a real on-behalf-of credential, not a re-check of the login.
    // read = view positions; trade = execute a trade (a SEPARATE, explicit consent).
    const gradesReadScope = new cognito.ResourceServerScope({
      scopeName: 'read', scopeDescription: 'View positions in your funds',
    });
    const gradesWriteScope = new cognito.ResourceServerScope({
      scopeName: 'trade', scopeDescription: 'Execute a trade in your funds',
    });
    // The resource-server identifier stays 'portfolio-api' regardless of env: it is
    // scoped WITHIN this (suffixed) user pool, so there is no cross-env collision,
    // and keeping it stable means the scope strings ('portfolio-api/read') match the
    // agent code and API authorizer without per-env wiring.
    const gradesResourceServer = new cognito.UserPoolResourceServer(this, 'GradesResourceServer', {
      userPool,
      identifier: 'portfolio-api',
      userPoolResourceServerName: 'portfolio-api',
      scopes: [gradesReadScope, gradesWriteScope],
    });

    // Dedicated confidential client for the AgentCore Identity OAuth2 credential
    // provider: has a secret, uses the authorization-code flow, and requests the
    // Grades scopes. The real callback URL (returned by
    // create-oauth2-credential-provider) is registered onto this client by
    // deploy.sh after creation — see landmine B. The placeholder below just lets
    // the client synthesize with code flow enabled.
    const gradesOAuthClient = new cognito.UserPoolClient(this, 'GradesOAuthClient', {
      userPool,
      userPoolClientName: sfx('agentcore-demo-grades-oauth'),
      generateSecret: true,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.resourceServer(gradesResourceServer, gradesReadScope),
          cognito.OAuthScope.resourceServer(gradesResourceServer, gradesWriteScope),
        ],
        callbackUrls: ['https://example.com/placeholder-callback'],
      },
    });
    gradesOAuthClient.node.addDependency(gradesResourceServer);

    // ---- AgentCore Identity: Market-Data resource server + M2M client ----
    // The machine-to-machine (2-legged / client_credentials) counterpart to the 3LO
    // Grades flow. This is a SEPARATE resource server on purpose: the agent
    // authenticates here as the FIRM's licensed application (no user), so reusing the
    // per-user portfolio-api scopes would muddy the audit story. A market-data vendor
    // licenses the institution, not the individual PM — client_credentials is exactly
    // the right shape, and the token deliberately carries the app client_id, not a sub.
    const marketReadScope = new cognito.ResourceServerScope({
      scopeName: 'read', scopeDescription: 'Read licensed market/reference data',
    });
    const marketResourceServer = new cognito.UserPoolResourceServer(this, 'MarketDataResourceServer', {
      userPool,
      identifier: 'market-data',
      userPoolResourceServerName: 'market-data',
      scopes: [marketReadScope],
    });

    // Confidential M2M client. client_credentials requires a secret and ONLY custom
    // resource-server scopes (Cognito rejects openid/email/profile mixed in). No user
    // auth flows — this client never logs a human in. deploy.sh reads its secret via
    // describe-user-pool-client (the secret is not a CloudFormation output) and creates
    // the M2M OAuth2 credential provider from it.
    const marketDataM2MClient = new cognito.UserPoolClient(this, 'MarketDataM2MClient', {
      userPool,
      userPoolClientName: sfx('agentcore-demo-marketdata-m2m'),
      generateSecret: true,
      authFlows: {},
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [cognito.OAuthScope.resourceServer(marketResourceServer, marketReadScope)],
      },
    });
    marketDataM2MClient.node.addDependency(marketResourceServer);

    // ========== DYNAMODB (Identity Demo) ==========
    const userDataTable = new dynamodb.Table(this, 'UserDataTable', {
      tableName: sfx('agentcore-demo-userdata'),
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Point-in-time recovery on the DATA tables (continuous 35-day backups). RemovalPolicy
      // stays DESTROY so `cleanup.sh` can tear the demo down; PROD SHOULD USE RemovalPolicy.RETAIN
      // + deletionProtection: true so a stack delete can never silently drop user data.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (Grades — downstream resource for 3LO Identity) ==========
    const gradesTable = new dynamodb.Table(this, 'GradesTable', {
      tableName: sfx('agentcore-demo-grades'),
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Positions/holdings = data worth recovering → PITR on. PROD: RETAIN + deletionProtection.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (WebSocket Connections) ==========
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: sfx('agentcore-demo-connections'),
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (3LO OAuth session binding) ==========
    // Short-lived bridge: when the agent vends a 3LO token and gets an auth URL, it
    // stashes the user's inbound JWT here keyed by the custom_state (the user sub).
    // The /oauth/callback Lambda reads it to present userToken (not userId) to
    // CompleteResourceTokenAuth — required because the session was bound via the JWT
    // path. TTL auto-expires rows so tokens don't linger.
    const oauthSessionsTable = new dynamodb.Table(this, 'OAuthSessionsTable', {
      tableName: sfx('agentcore-demo-oauth-sessions'),
      partitionKey: { name: 'state', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      // Holds short-lived inbound JWTs mid-3LO-handshake → PITR on so a recovery can't lose an
      // in-flight consent binding. PROD: RETAIN + deletionProtection.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (Entitlements — admin-managed RBAC, single source of truth) ==========
    // The authoritative store for fine-grained access control. One item per (principal, scope):
    //   PK principal  = "user#<cognito-sub>"  |  "agent#<workload-name>"
    //   SK dataType   = "meta" | "tools" | "desks" | "creds"
    // The "tools"/"desks"/"creds" items each carry a `grants` Map of <key> -> BOOL, where a
    // present+true entry = GRANTED and anything else = DENIED (default-deny WITHIN a managed
    // principal). A principal with NO record at all is treated as UNMANAGED (fail-open) so a
    // fresh deploy never bricks before deploy.sh seeds defaults; once the admin touches a
    // principal it becomes managed and default-deny applies. This is read by THREE independent
    // enforcement points (defense in depth): the runtime pre-check (agent/main.py), the Gateway
    // REQUEST interceptor (platform MCP boundary), and the admin-api (writes + Cedar re-materialize).
    const entitlementsTable = new dynamodb.Table(this, 'EntitlementsTable', {
      tableName: sfx('agentcore-demo-entitlements'),
      partitionKey: { name: 'principal', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // This is the authoritative RBAC store — losing it silently un-governs the platform, so
      // PITR is on. PROD: RETAIN + deletionProtection so a stack delete can't drop entitlements.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (Rate limits — per-user / per-app / per-tool fixed-window counters) ==========
    // The throttle store the Gateway REQUEST interceptor writes on every ENTITLED tools/call. One
    // item per (dimension-key, window-bucket): PK rlKey = "<dim>#<id>@<bucket>", attrs { count, ttl }.
    // The interceptor does one atomic ADD per call and reads back the running total; the item's TTL
    // self-expires ~one window after creation, so the window resets with no sweeper. Rate limiting is
    // an abuse guard (fail-open), NOT the authorization boundary (that's EntitlementsTable), so this
    // table is deliberately ephemeral — no PITR, and a DESTROY removal policy.
    const rateLimitTable = new dynamodb.Table(this, 'RateLimitTable', {
      tableName: sfx('agentcore-demo-rate-limits'),
      partitionKey: { name: 'rlKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== DYNAMODB (Access Requests — self-service request → admin approve) ==========
    // The write-workflow companion to EntitlementsTable: a non-admin user REQUESTS a desk/tool
    // they lack; an admin APPROVES (which runs the real grant path + all its side-effects) or
    // DENIES. Separation of duties — the requester is never the approver. One item per request:
    //   PK requestId = <uuid4>
    //   attrs: requesterSub, requesterEmail, kind ('tools'|'desks'), key, label, reason,
    //          status ('PENDING'|'APPROVED'|'DENIED'), createdAt, decidedBy, decidedAt
    // The status-index GSI lets the admin list PENDING requests without a table scan.
    const accessRequestsTable = new dynamodb.Table(this, 'AccessRequestsTable', {
      tableName: sfx('agentcore-demo-access-requests'),
      partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Governance workflow record (who asked for what, who decided) — PITR on so an audit
      // trail isn't silently lost. PROD: RETAIN + deletionProtection.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    accessRequestsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });

    // ========== DYNAMODB (Fixed-Income bond universe — meridian2 FI demo) ==========
    // Holds the ~3,000-bond universe generated by the bond-ingest Lambda from REAL
    // market data (Treasury curve + ICE BofA credit spreads). Per-CUSIP items are the
    // "3k bonds in DynamoDB" proof + point lookups; the full working set is also written
    // to S3 (universe/latest.json) for the bond tools to load in one shot. GSIs let the
    // screen tool query by rating-band or sector without a full scan.
    const bondsTable = new dynamodb.Table(this, 'BondsTable', {
      tableName: sfx('agentcore-demo-bonds'),
      partitionKey: { name: 'cusip', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    bondsTable.addGlobalSecondaryIndex({
      indexName: 'rating-index',
      partitionKey: { name: 'rating', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ytm', type: dynamodb.AttributeType.NUMBER },
    });
    bondsTable.addGlobalSecondaryIndex({
      indexName: 'sector-index',
      partitionKey: { name: 'sector', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'mod_duration', type: dynamodb.AttributeType.NUMBER },
    });

    // ========== S3 (market data + universe snapshot for the FI demo) ==========
    // Real Treasury curve + spread ladder (latest + dated history for time-series charts)
    // and the full computed universe snapshot the bond tools read.
    const marketBucket = new s3.Bucket(this, 'MarketDataBucket', {
      bucketName: env ? `agentcore-demo-market-${env}-${this.account}` : `agentcore-demo-market-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // Deny any non-TLS request (adds the aws:SecureTransport=false Deny to the bucket policy).
      // Cheap, no demo impact. PROD should ALSO add a CMK (encryption: KMS + bucketKeyEnabled)
      // with key rotation for encryption-at-rest control.
      enforceSSL: true,
    });

    // ========== LAMBDA: bond-ingest (real-data universe builder) ==========
    // Pulls the real US Treasury par-yield curve + ICE BofA OAS ladder from FRED and
    // generates the deterministic ~3k-bond universe, computing each bond's yield / price /
    // duration / convexity off the real curve. Dependency-free (urllib + boto3), so no
    // bundling. FRED_API_KEY is injected by deploy.sh from the gitignored .fred-key (the
    // CDK default empty string makes the Lambda fall back to the baked snapshot).
    const bondIngestLambda = new lambda.Function(this, 'BondIngestLambda', {
      functionName: sfx('agentcore-demo-bond-ingest'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/bond-ingest')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        BONDS_TABLE: bondsTable.tableName,
        MARKET_BUCKET: marketBucket.bucketName,
        UNIVERSE_SIZE: '3000',
        // DEMO: the FRED key is injected as a plaintext Lambda env var by deploy.sh from the
        // gitignored .fred-key. PROD SHOULD move it to the AgentCore Identity API-key vault /
        // Secrets Manager (the runtime already vends FRED via that path for macro_indicator) and
        // read it at invoke time, so the key never sits in a Lambda env var or CloudFormation.
        FRED_API_KEY: '', // set by deploy.sh from .fred-key
      },
    });
    bondsTable.grantReadWriteData(bondIngestLambda);
    marketBucket.grantReadWrite(bondIngestLambda);

    // Daily refresh so the book re-marks against the live curve (like a real EOD mark).
    new events.Rule(this, 'BondIngestSchedule', {
      ruleName: sfx('agentcore-demo-bond-ingest-daily'),
      schedule: events.Schedule.cron({ minute: '0', hour: '11' }), // ~7am ET after FRED posts
      targets: [new eventsTargets.LambdaFunction(bondIngestLambda)],
    });

    // ========== DYNAMODB (Insurance submission universe — Ridgeline underwriting desk) ==========
    // Sibling of BondsTable: holds the ~4,000-submission underwriting universe generated by the
    // insurance-ingest Lambda, anchored to the REAL FEMA National Risk Index county file. Per-
    // submission items are the "4k risks in DynamoDB" proof + point lookups; the full working set
    // is also written to S3 (universe/insurance_latest.json) for the insurance tools to load.
    const insuranceTable = new dynamodb.Table(this, 'InsuranceTable', {
      tableName: sfx('agentcore-demo-insurance'),
      partitionKey: { name: 'sub_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== LAMBDA: insurance-ingest (real-data submission-universe builder) ==========
    // Pulls the REAL FEMA National Risk Index county file (per-county, per-peril Expected Annual
    // Loss + building-value exposure) from FEMA's public, key-free ArcGIS FeatureServer and
    // generates the deterministic ~4k-submission universe, computing each submission's catastrophe
    // loss cost / expected loss / hazard grade off the real FEMA county loss. Dependency-free
    // (urllib + boto3), so no bundling. No API key needed (FEMA NRI is public). Reuses the same
    // marketBucket as bond-ingest so all vertical snapshots live in one governed bucket.
    const insuranceIngestLambda = new lambda.Function(this, 'InsuranceIngestLambda', {
      functionName: sfx('agentcore-demo-insurance-ingest'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/insurance-ingest')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        INSURANCE_TABLE: insuranceTable.tableName,
        MARKET_BUCKET: marketBucket.bucketName,
        UNIVERSE_SIZE: '4000',
      },
    });
    insuranceTable.grantReadWriteData(insuranceIngestLambda);
    marketBucket.grantReadWrite(insuranceIngestLambda);

    // Daily refresh (after the bond ingest) so the book re-rates against the current FEMA file.
    new events.Rule(this, 'InsuranceIngestSchedule', {
      ruleName: sfx('agentcore-demo-insurance-ingest-daily'),
      schedule: events.Schedule.cron({ minute: '30', hour: '11' }),
      targets: [new eventsTargets.LambdaFunction(insuranceIngestLambda)],
    });

    // ========== DYNAMODB + LAMBDA: banking-ingest (real FRED-anchored credit universe) ==========
    // Rampart Financial commercial-credit desk. Pulls the REAL rate curve + SOFR/prime and the
    // REAL Fed commercial-bank credit-performance series (business-loan delinquency & charge-off,
    // CRE delinquency) from FRED, and builds a deterministic ~1,500-borrower loan universe with PD
    // anchored to real delinquency, LGD to real charge-off, and pricing off the live curve.
    const bankingTable = new dynamodb.Table(this, 'BankingTable', {
      tableName: sfx('agentcore-demo-banking'),
      partitionKey: { name: 'borrower_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const bankingIngestLambda = new lambda.Function(this, 'BankingIngestLambda', {
      functionName: sfx('agentcore-demo-banking-ingest'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/banking-ingest')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        BANKING_TABLE: bankingTable.tableName,
        MARKET_BUCKET: marketBucket.bucketName,
        UNIVERSE_SIZE: '1500',
        FRED_API_KEY: '', // set by deploy.sh from .fred-key (falls back to baked snapshot if absent)
      },
    });
    bankingTable.grantReadWriteData(bankingIngestLambda);
    marketBucket.grantReadWrite(bankingIngestLambda);
    new events.Rule(this, 'BankingIngestSchedule', {
      ruleName: sfx('agentcore-demo-banking-ingest-daily'),
      schedule: events.Schedule.cron({ minute: '45', hour: '11' }),
      targets: [new eventsTargets.LambdaFunction(bankingIngestLambda)],
    });

    // ========== DYNAMODB + LAMBDA: fintech-ingest (real FRED-anchored payments universe) ==========
    // Kairo payments/risk desk. Pulls the REAL consumer-credit environment (credit-card
    // delinquency & charge-off, consumer credit, unemployment) from FRED as the cyclical anchor and
    // builds a deterministic ~2,000-merchant portfolio with realistic payments loss bps that move
    // with the real credit cycle.
    const fintechTable = new dynamodb.Table(this, 'FintechTable', {
      tableName: sfx('agentcore-demo-fintech'),
      partitionKey: { name: 'merchant_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const fintechIngestLambda = new lambda.Function(this, 'FintechIngestLambda', {
      functionName: sfx('agentcore-demo-fintech-ingest'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/fintech-ingest')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        FINTECH_TABLE: fintechTable.tableName,
        MARKET_BUCKET: marketBucket.bucketName,
        UNIVERSE_SIZE: '2000',
        FRED_API_KEY: '', // set by deploy.sh from .fred-key
      },
    });
    fintechTable.grantReadWriteData(fintechIngestLambda);
    marketBucket.grantReadWrite(fintechIngestLambda);
    new events.Rule(this, 'FintechIngestSchedule', {
      ruleName: sfx('agentcore-demo-fintech-ingest-daily'),
      schedule: events.Schedule.cron({ minute: '0', hour: '12' }),
      targets: [new eventsTargets.LambdaFunction(fintechIngestLambda)],
    });

    // ========== ECR REPOSITORY ==========
    // Created in CDK so fresh deploys get a writable repo without manual setup.
    const ecrRepo = new ecr.Repository(this, 'AgentEcrRepo', {
      repositoryName: sfx('agentcore-demo-agent'),
      emptyOnDelete: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== S3 BUCKET FOR AGENT CODE ==========
    const agentCodeBucket = new s3.Bucket(this, 'AgentCodeBucket', {
      bucketName: env ? `agentcore-demo-code-${env}-${this.account}` : `agentcore-demo-code-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // Not public and not explicitly BLOCK_ALL historically; add both here — deny non-TLS +
      // block all public access. PROD: add a CMK as above.
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // ========== IAM ROLES ==========

    // Role for AgentCore Runtime
    const agentRuntimeRole = new iam.Role(this, 'AgentRuntimeRole', {
      roleName: sfx('agentcore-demo-runtime-role'),
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
        new iam.ServicePrincipal('bedrock.amazonaws.com'),
      ),
    });

    // Bedrock model invocation, scoped to the SPECIFIC models the demo switches between
    // (agent/main.py MODELS) rather than a bare '*'. These are CROSS-REGION inference
    // profiles (us.* ids), so InvokeModel needs BOTH the inference-profile ARN in this
    // account/region AND the underlying foundation-model ARNs in every region the profile
    // may route to. We therefore allow: (a) the account/region inference-profile namespace,
    // and (b) foundation-model resources across regions (`:*::foundation-model/*` — foundation
    // models have no account segment). This is far tighter than '*' (bedrock model resources
    // only, no other bedrock APIs) while keeping cross-region inference working. PROD: pin the
    // exact model ids the desk is licensed for instead of the foundation-model wildcard.
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:*:${this.account}:application-inference-profile/*`,
        'arn:aws:bedrock:*::foundation-model/*',
      ],
    }));

    // ========== BEDROCK GUARDRAIL (prompt + response PII / secret filtering) ==========
    // The content-filtering pillar: a managed Bedrock Guardrail the runtime calls via ApplyGuardrail
    // on the INBOUND user prompt (before the model/tools) and on the OUTBOUND answer. It flags/masks
    // PII (name, email, phone, SSN, credit card, AWS keys) and BLOCKS on regex-matched secrets (an
    // AWS secret-access-key shape, a private-key header). This directly answers Michelle's "flag
    // secrets/PII in prompts" + "response filtering". The runtime reads its id/version from env.
    const contentGuardrail = new bedrock.CfnGuardrail(this, 'ContentGuardrail', {
      name: sfx('agentcore-demo-guardrail'),
      description: 'Flags/masks PII and blocks secrets in prompts and responses (demo).',
      blockedInputMessaging: 'This request was blocked by the AgentCore content guardrail (it appeared to contain a secret or disallowed content). Please remove sensitive values and try again.',
      blockedOutputsMessaging: 'The response was blocked by the AgentCore content guardrail.',
      // PII: mask the common identifiers so they never reach the model/tools or the answer; the
      // secret-shaped patterns below BLOCK outright (a secret in a prompt is never legitimate here).
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
          { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
        ],
        regexesConfig: [
          {
            name: 'aws-secret-access-key',
            description: 'A 40-char base64-ish AWS secret access key shape',
            pattern: '(?i)aws_secret_access_key\\s*[=:]\\s*[A-Za-z0-9/+]{40}',
            action: 'BLOCK',
          },
          {
            name: 'private-key-block',
            description: 'A PEM private-key header',
            pattern: '-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----',
            action: 'BLOCK',
          },
        ],
      },
    });
    // ApplyGuardrail on this specific guardrail (all its versions). Runtime-only; least-privilege.
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:ApplyGuardrail'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:guardrail/*`],
    }));
    new cdk.CfnOutput(this, 'GuardrailId', { value: contentGuardrail.attrGuardrailId });
    // attrVersion is 'DRAFT' at create; deploy.sh passes GUARDRAIL_VERSION (defaults to DRAFT, which
    // ApplyGuardrail accepts) to the runtime. A published version can be pinned later for prod.
    new cdk.CfnOutput(this, 'GuardrailArn', { value: contentGuardrail.attrGuardrailArn });

    // AgentCore data-plane (runtime): memory read/write, identity token/key vend, gateway
    // invoke, workload identity, browser/code-interpreter sessions. The exact data-plane
    // action set the SDK uses is wide and still evolving, and the resource ARNs (memory,
    // gateway, workload identity, browser, code-interpreter) are created LATER by deploy.sh
    // and are not known at synth time — so we keep the action verb broad but SCOPE THE
    // RESOURCE to this account+region's bedrock-agentcore namespace (no cross-account, no
    // other service). PROD: enumerate the concrete data-plane actions + pin each resource ARN
    // once the runtime/gateway/memory ids are known (they can be threaded back in via a
    // second deploy-time PutRolePolicy).
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:*',
      ],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));

    // Runtime must pull its container image from the CDK-owned ECR repo. (This was
    // previously added out-of-band to the live role; captured here so fresh deploys
    // are self-contained.) GetAuthorizationToken is an account-level action with no
    // resource scope (must be '*'); the image/layer reads are scoped to THIS repo.
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchCheckLayerAvailability',
      ],
      resources: [ecrRepo.repositoryArn],
    }));

    // Agent's user_data_lookup + bond-tools tools have a direct-Lambda fallback when the
    // Gateway path is blocked — needs lambda:InvokeFunction. The redundant wildcard grant
    // that used to live here was REMOVED: the specific tool-Lambda ARNs are granted below
    // where those Lambdas are defined (userDataLambda, bondToolsLambda, and the per-vertical
    // tools loop), so the wildcard added nothing but breadth.

    // AgentCore Identity outbound: the runtime vends tokens/keys via the
    // bedrock-agentcore data plane (GetResourceOauth2Token / GetResourceApiKey,
    // covered by the wildcard above) but ALSO must read the credential providers'
    // secrets from the identity-managed Secrets Manager namespace. Those secrets are
    // NOT in the bedrock-agentcore namespace, so grant them explicitly. Two paths:
    //   oauth2/<provider>*  — 3LO (grades) AND M2M (market-data) OAuth2 providers
    //   apikey/<provider>*  — the API-key vault (FRED). Without this path the FRED
    //                         macro_indicator tool's GetResourceApiKey → SM read fails.
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:bedrock-agentcore-identity!default/oauth2/*`,
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:bedrock-agentcore-identity!default/apikey/*`,
      ],
    }));

    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
      ],
      resources: [
        agentCodeBucket.bucketArn,
        `${agentCodeBucket.bucketArn}/*`,
      ],
    }));

    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
      ],
      resources: [userDataTable.tableArn],
    }));

    // RBAC: the runtime is the PRIMARY per-user enforcement point — it reads the caller's
    // (and its own agent workload's) entitlements from the entitlements table on each turn.
    entitlementsTable.grantReadData(agentRuntimeRole);

    // Runtime writes the short-lived JWT into the 3LO session-binding table.
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [oauthSessionsTable.tableArn],
    }));

    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: ['*'],
    }));

    // Observability: ADOT in the container exports spans to X-Ray and custom
    // metrics to CloudWatch (CloudWatch GenAI Observability / Transaction Search).
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
      ],
      resources: ['*'],
    }));
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' },
      },
    }));

    // Role for AgentCore Gateway
    const gatewayRole = new iam.Role(this, 'GatewayRole', {
      roleName: sfx('agentcore-demo-gateway-role'),
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });

    // The Gateway invokes its TARGET tool Lambdas (vault / userdata / bond-tools / the three
    // vertical tools) + the REQUEST interceptor. Their function ARNs all share the
    // `agentcore-demo-*` naming under this account/region, so scope invoke to that name
    // prefix rather than a bare '*'. (The concrete per-target ARNs are known at synth time for
    // most, but the vault/interceptor/targets are wired by deploy.sh via create-gateway-target;
    // a name-prefixed ARN covers every current + future demo target Lambda without reopening to
    // every Lambda in the account.) PROD: enumerate the exact target function ARNs.
    gatewayRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:agentcore-demo-*`,
      ],
    }));

    // Linking a policy engine to the gateway calls GetPolicyEngine as this role, and Cedar
    // enforcement reads across the policy-engine namespace. The policy-engine/gateway ARNs are
    // created by deploy.sh (not known at synth), so scope the RESOURCE to this account+region's
    // bedrock-agentcore namespace instead of a bare '*'. (Live role had this added out-of-band
    // as PolicyEngineAccess; captured here for fresh deploys.) PROD: pin the policy-engine ARN.
    gatewayRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:*'],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));

    // OUTBOUND API-KEY VEND for OpenAPI targets (positions-db). When the Gateway invokes an OpenAPI
    // target bound to an API_KEY credential provider, it VENDS the key by reading the provider's
    // backing secret from the AgentCore Identity token vault (Secrets Manager namespace
    // `bedrock-agentcore-identity!default/apikey/<provider>-<hash>`) and injecting it as the header
    // the OpenAPI securityScheme names. WITHOUT this GetSecretValue grant the vend fails and the
    // Gateway returns a generic "internal error" BEFORE ever calling the backend (the resolver never
    // logs). This is the second half of the fix (the first is declaring the matching apiKey
    // securityScheme in scripts/positions_db_openapi.json) — both are required for the OpenAPI
    // target to work. Scoped to the apikey sub-namespace, not a bare '*'. (Lambda targets don't need
    // this — they authenticate via the GATEWAY_IAM role, not a vended key.)
    gatewayRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:bedrock-agentcore-identity!default/apikey/*`,
      ],
    }));

    // ========== LAMBDA: Secure Vault (Gateway Target) ==========
    // Holds secret values the model cannot know. When the Cedar policy blocks
    // this gateway tool, the agent genuinely cannot answer — unlike math, which
    // the model can compute unaided. This is what makes the policy demo land.
    // The vault-tool Lambda fetches its secret values from AWS Secrets Manager at runtime (it no
    // longer hardcodes them). We create the backing secret here as a JSON document with the keys
    // the tool expects, populated with SYNTHETIC / DEMO values (clearly labelled, redacted-style
    // PINs, and small synthetic sanctions / PEP / fraud lists containing a couple of demo names
    // so the compliance-screening demo actually returns matches). RemovalPolicy.DESTROY matches
    // the other demo resources so teardown works; PROD would use RETAIN + rotation.
    const vaultSecret = new secretsmanager.Secret(this, 'VaultSecret', {
      secretName: sfx('agentcore-demo-vault'),
      description: 'DEMO synthetic vault values for the secure_vault gateway tool (NOT real secrets).',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        // Compliance restricted list (unchanged demo string).
        restricted_list:
          'GLENCO 5.1% 2031, ARGENTINA USD 2035 — RESTRICTED until 2026-07-15 (pending mandate review) [DEMO]',
        // Redacted-style PINs — clearly synthetic.
        bloomberg_terminal_pin: 'DEMO-BLMB-PIN-••4417',
        oms_master_pin: 'DEMO-OMS-••7e44',
        counterparty_credit_memo:
          'Counterparty NorthBay Securities — internal credit rating BB-, exposure cap $50MM [DEMO]',
        // Synthetic sanctions watchlist — PLAIN STRINGS (the vault-tool screens by string match,
        // so entries must be names, not objects). Includes 'NorthBay Securities' (the counterparty
        // named in counterparty_credit_memo) so screening that counterparty yields a demo MATCH.
        sanctions_watchlist: [
          'NorthBay Securities',
          'DEMO BLOCKED TRADING CO',
          'SYNTHETIC SANCTIONS ENTITY A',
        ],
        // Synthetic politically-exposed-persons list (plain strings).
        pep_list: [
          'DEMO PEP PERSON ONE',
          'Ivan Petrov (DEMO official)',
        ],
        // Synthetic fraud blocklist — plain-string entity ids flagged in prior demo runs.
        fraud_blocklist: [
          'MERCH-00420',
          'ACCT-99137',
          'DEMO-FRAUD-RING-001',
        ],
      })),
    });

    const vaultLambda = new lambda.Function(this, 'VaultLambda', {
      functionName: sfx('agentcore-demo-vault-tool'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/vault-tool')),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        // The vault-tool reads its secrets from THIS secret (shared contract with the tools agent).
        VAULT_SECRET_ID: vaultSecret.secretName,
      },
    });
    // Least-privilege: the vault Lambda may read ONLY its own secret.
    vaultSecret.grantRead(vaultLambda);

    // ========== LAMBDA: User Data Lookup (Gateway Target) ==========
    const userDataLambda = new lambda.Function(this, 'UserDataLambda', {
      functionName: sfx('agentcore-demo-userdata-tool'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/userdata-tool')),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: userDataTable.tableName,
      },
    });
    userDataTable.grantReadData(userDataLambda);
    // The agent runtime's user_data_lookup tool has a direct-invoke fallback (main.py) when the
    // Cedar policy blocks the Gateway path; grant it invoke on ONLY this Lambda (replaces the
    // removed wildcard lambda:InvokeFunction that used to blanket-cover it).
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [userDataLambda.functionArn],
    }));

    // ========== LAMBDA: Grades API (downstream resource for 3LO Identity) ==========
    // Reached by the agent with a user-delegated OAuth token. Reads identity from
    // the API Gateway JWT authorizer claims and writes an audit log on updates.
    const gradesLambda = new lambda.Function(this, 'GradesLambda', {
      functionName: sfx('agentcore-demo-grades-api'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/grades-api')),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: gradesTable.tableName,
      },
    });
    gradesTable.grantReadWriteData(gradesLambda);

    // ========== LAMBDA: Market-Data API (downstream resource for M2M Identity) ==========
    // Reached by the agent with a client_credentials (M2M) OAuth token — as the FIRM,
    // not a user. Serves the same real universe snapshot bond-tools uses, framed as a
    // licensed vendor feed. Reads the acting principal from the JWT client_id claim.
    const marketDataLambda = new lambda.Function(this, 'MarketDataLambda', {
      functionName: sfx('agentcore-demo-market-data-api'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/market-data-api')),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        MARKET_BUCKET: marketBucket.bucketName,
      },
    });
    marketBucket.grantRead(marketDataLambda);

    // ========== LAMBDA: WebSocket Handler (Frontend ↔ AgentCore Runtime) ==========
    // AGENT_RUNTIME_ARN and MEMORY_ID are left blank here; deploy.sh sets them
    // after the AgentCore runtime is created so they are never baked into CDK.
    const websocketLambda = new lambda.Function(this, 'WebSocketLambda', {
      functionName: sfx('agentcore-demo-websocket'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      // Dependency-free asset (no Docker bundling needed). The authoritative JWT
      // validation happens at the runtime's customJWTAuthorizer on every bearer
      // invoke; the connect-time check here is a structure/expiry guard.
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/websocket')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        AGENT_RUNTIME_ARN: '',
        MEMORY_ID: '',
        // Persona-scoped access: the connect handler rejects an un-entitled desk at the WS edge
        // (before any runtime invoke). Read-only; the runtime's per-turn gate stays authoritative.
        ENTITLEMENTS_TABLE: entitlementsTable.tableName,
      },
    });

    // The WS Lambda invokes the AgentCore runtime the browser chats with. The runtime ARN is
    // created by deploy.sh (post-synth) and injected as AGENT_RUNTIME_ARN, so scope the RESOURCE
    // to this account+region's runtime namespace (`runtime/*` + its endpoints) rather than '*'.
    websocketLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:InvokeAgentRuntime',
        'bedrock-agentcore:InvokeAgentRuntimeForUser',
        'bedrock-agentcore:StopRuntimeSession',
      ],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`,
      ],
    }));

    connectionsTable.grantReadWriteData(websocketLambda);
    entitlementsTable.grantReadData(websocketLambda);   // desk connect-gate reads the caller's grants

    // ========== LAMBDA: AG-UI Bridge (CopilotKit/@ag-ui/client ↔ AgentCore Runtime) ==========
    // Streaming relay exposed via a Function URL in RESPONSE_STREAM mode. The browser
    // POSTs an AG-UI RunAgentInput + Cognito bearer JWT; this Lambda invokes the runtime
    // with Accept: text/event-stream and pipes the AG-UI SSE straight back. Node 20 so
    // we get first-class response streaming (awslambda.streamifyResponse). Zero npm deps.
    // AGENT_RUNTIME_ARN is blank here; deploy.sh sets it after the runtime is created.
    const aguiBridgeLambda = new lambda.Function(this, 'AgUiBridgeLambda', {
      functionName: sfx('agentcore-demo-agui-bridge'),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/agui-bridge')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        AGENT_RUNTIME_ARN: '',
        // CORS origin is locked to the CloudFront domain once it's known (deploy.sh
        // updates this env var after the distribution exists). Bootstrap value is the synth-time
        // corsAllowedOrigin (a real origin if supplied via context/env, else '*').
        ALLOWED_ORIGIN: corsAllowedOrigin,
      },
    });

    // Same as the WS Lambda: scope runtime-invoke to this account+region's runtime namespace
    // (the concrete ARN is injected post-deploy as AGENT_RUNTIME_ARN).
    aguiBridgeLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:InvokeAgentRuntimeForUser'],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`,
      ],
    }));

    // Function URL with response streaming. authType AWS_IAM: this account's org SCP
    // forbids public (NONE-auth) Function URLs, so the browser SigV4-signs each request
    // using short-lived credentials vended by a Cognito Identity Pool (see below). The
    // Cognito JWT — still the real app identity that the runtime's customJWTAuthorizer
    // validates — rides in the `x-meridian-cognito-token` header (the Authorization
    // header now carries the SigV4 signature). The bridge reads it from there.
    const aguiFnUrl = aguiBridgeLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        // Locked to the CloudFront origin (corsAllowedOrigin; '*' only until deploy.sh sets it).
        allowedOrigins: corsAllowOrigins,
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: [
          'authorization',
          'content-type',
          'x-amz-date',
          'x-amz-security-token',
          'x-amz-content-sha256',
          'x-meridian-cognito-token',
          'x-amzn-bedrock-agentcore-runtime-session-id',
        ],
        maxAge: cdk.Duration.days(1),
      },
    });

    // ---- Cognito Identity Pool: browser → temp AWS creds → SigV4 to the Function URL ----
    // The user-pool app client is an allowed identity provider; an authenticated user
    // exchanges its Cognito JWT for credentials whose role may invoke ONLY this bridge's
    // Function URL. This is the least-privilege replacement for a public Function URL.
    const identityPool = new cognito.CfnIdentityPool(this, 'AgUiIdentityPool', {
      identityPoolName: sfx('agentcore_demo_agui').replace(/-/g, '_'),
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    const aguiInvokeRole = new iam.Role(this, 'AgUiInvokeRole', {
      roleName: sfx('agentcore-demo-agui-invoke-role'),
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });
    aguiInvokeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunctionUrl'],
      resources: [aguiBridgeLambda.functionArn],
      conditions: { StringEquals: { 'lambda:FunctionUrlAuthType': 'AWS_IAM' } },
    }));

    new cognito.CfnIdentityPoolRoleAttachment(this, 'AgUiIdentityPoolRoles', {
      identityPoolId: identityPool.ref,
      roles: { authenticated: aguiInvokeRole.roleArn },
    });

    // ========== LAMBDA: Policy Toggle ==========
    const policyToggleLambda = new lambda.Function(this, 'PolicyToggleLambda', {
      functionName: sfx('agentcore-demo-policy-toggle'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      // Lambda's built-in boto3 lacks bedrock-agentcore-control policy operations
      // (get_policy/update_policy), so bundle a current boto3. boto3 is pure
      // Python, so local bundling works without Docker if pip is on PATH.
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/policy-toggle'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // cp -a (no -u; macOS cp lacks GNU -u). index.py + requirements
                // are copied alongside the pip-installed deps.
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/policy-toggle'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
      },
    });

    // policy-toggle only touches the Cedar policy engine (get_policy/update_policy). The
    // policy-engine id is created by deploy.sh (not known at synth), so scope the RESOURCE to
    // this account+region's bedrock-agentcore namespace rather than a bare '*'. The action verb
    // stays broad ONLY because the exact control-plane IAM action strings vary by CLI/SDK
    // version and a wrong enumeration would silently break the guardrail demo — the resource
    // scoping is the real least-privilege win here. PROD: pin the policy-engine ARN + narrow to
    // GetPolicy/UpdatePolicy once the action names are confirmed for the target SDK.
    policyToggleLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock-agentcore:*',
      ],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));

    // ========== LAMBDA: Admin API (fine-grained RBAC control plane) ==========
    // The ONLY writer to the entitlements table. Grant/revoke per-user tool+desk access and
    // per-agent outbound-credential access; on write it re-materializes the per-tool Cedar
    // blocklist policy AND pushes an entitlements_changed frame to the affected user's live WS
    // connections (instant UI update). Admin authority is enforced INSIDE the Lambda by
    // requiring the verified JWT's cognito:groups to contain `admins` — the /me/entitlements
    // self-read is the only non-admin route. Bundles a current boto3 for the Cedar policy ops
    // (same pattern as policy-toggle); WS_ENDPOINT/CONNECTIONS_TABLE/POLICY_* injected by deploy.sh.
    const adminApiLambda = new lambda.Function(this, 'AdminApiLambda', {
      functionName: sfx('agentcore-demo-admin-api'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/admin-api'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/admin-api'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        ACCOUNT_ID: this.account,
        ENTITLEMENTS_TABLE: entitlementsTable.tableName,
        // Self-service request → admin approve workflow store (synth-time known; no deploy.sh
        // injection needed). See AccessRequestsTable above and lambda/admin-api access routes.
        ACCESS_REQUESTS_TABLE: accessRequestsTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        // The runtime role whose inline creds-blocklist policy the admin-api maintains (the
        // AGENT-side IAM kill-switch). Known at synth time — it's the role we defined above.
        RUNTIME_ROLE_ARN: agentRuntimeRole.roleArn,
        // WS_ENDPOINT, POLICY_ENGINE_ID, GATEWAY_ARN, BLOCKLIST_POLICY_ID, AGENT_WORKLOADS,
        // RUNTIME_ID, and the credential-provider names are injected post-create by deploy.sh
        // (WS/gateway/policy/providers/runtime don't exist or aren't suffixed at synth time).
        WS_ENDPOINT: '',
        // Runtime id → the audit reader's CloudWatch log group (/admin/audit). Same post-create
        // injection as the observability Lambda's RUNTIME_ID (the runtime is CLI-provisioned).
        RUNTIME_ID: '',
        POLICY_ENGINE_ID: '',
        GATEWAY_ARN: '',
        BLOCKLIST_POLICY_ID: '',
        AGENT_WORKLOADS: '',
        // Credential-provider names for the IAM secret-ARN scoping (iam_creds.py).
        CREDENTIAL_PROVIDER_NAME: '',
        M2M_PROVIDER_NAME: '',
        FRED_APIKEY_PROVIDER_NAME: '',
        // ── "Gateway" console (gateway_console.py) — the live backend for the Gateway section. ──
        // GATEWAY_ID (→ the MCP endpoint + the external-client proxy path) is deploy.sh-injected
        // post-create (the Gateway is CLI-provisioned, not a synth-time resource). The guardrail id
        // + version (live ApplyGuardrail in the Content Firewall tester) are also deploy.sh-injected
        // — the same values the runtime uses. RATE_LIMIT_TABLE (the burst tester's real fixed-window
        // store) IS known at synth time, so set it here directly.
        GATEWAY_ID: '',
        GUARDRAIL_ID: '',
        GUARDRAIL_VERSION: 'DRAFT',
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
      },
    });
    entitlementsTable.grantReadWriteData(adminApiLambda);
    accessRequestsTable.grantReadWriteData(adminApiLambda);
    connectionsTable.grantReadWriteData(adminApiLambda);
    // Gateway console: the rate-limit burst tester writes the SAME fixed-window counters the
    // interceptor uses (under an isolated console-burst# principal), and the Content Firewall
    // tester calls Bedrock ApplyGuardrail (bedrock-runtime — distinct from the bedrock-agentcore
    // verb granted below).
    rateLimitTable.grantReadWriteData(adminApiLambda);
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:ApplyGuardrail'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:guardrail/*`],
    }));
    // List Cognito users + their group memberships for the admin grant grid.
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminListGroupsForUser', 'cognito-idp:ListGroups'],
      resources: [userPool.userPoolArn],
    }));
    // Cedar policy re-materialization (per-tool blocklist) on the AgentCore policy engine.
    // Resource scoped to this account+region's bedrock-agentcore namespace (the policy-engine
    // id is deploy.sh-created, not known at synth). Broad action verb retained for the same
    // SDK-version reason as policy-toggle above; PROD should pin the policy-engine ARN.
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:*'],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));
    // AGENT-side IAM kill-switch: the admin-api maintains ONE inline policy
    // (AgentCoreCredBlocklist — see lambda/admin-api/iam_creds.py CRED_BLOCKLIST_POLICY_NAME)
    // on the runtime role that DENIES GetSecretValue on a revoked credential provider's backing
    // secret. Scope the management permission to EXACTLY that role AND, via an iam:PolicyName
    // StringEquals condition, to EXACTLY that one inline policy name. This closes the
    // priv-esc primitive: even scoped to the runtime role, an unconditioned PutRolePolicy could
    // write an `Allow *` inline policy and widen the runtime; the condition means the admin-api
    // can only ever write/read/delete the single named deny policy, never anything else.
    // (Get/Put/Delete only; no PassRole, no AttachRolePolicy.)
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:GetRolePolicy'],
      resources: [agentRuntimeRole.roleArn],
      conditions: {
        // Must match iam_creds.CRED_BLOCKLIST_POLICY_NAME exactly.
        StringEquals: { 'iam:PolicyName': 'AgentCoreCredBlocklist' },
      },
    }));
    // Push entitlements_changed frames to live WS connections.
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/*`],
    }));
    // Read-only CloudWatch Logs Insights over the runtime's audit log lines (GET /admin/audit —
    // see lambda/admin-api/audit.py). StartQuery/GetQueryResults/DescribeLogGroups only, no
    // mutate. Resources '*' because Logs Insights StartQuery is account-wide (same scoping the
    // observability Lambda uses for its span reads); the query itself is pinned to the runtime
    // log group in audit.py.
    adminApiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['logs:StartQuery', 'logs:GetQueryResults', 'logs:DescribeLogGroups'],
      resources: ['*'],
    }));

    // ========== LAMBDA: Entitlements expiry SWEEPER (JIT-grant live revocation) ==========
    // Time-boxed grants lapse LAZILY (every enforcement point calls evaluate(now=...)); this
    // sweeper is the UX+hygiene layer — on a schedule it flips lapsed grants to false, strips the
    // dead expiry, and pushes entitlements_changed so an idle user's UI greys the desk/specialist
    // out the moment it expires. Dependency-free asset (builtin boto3 covers ddb + apigw-mgmt);
    // entitlements.py copied in by deploy.sh. WS_ENDPOINT injected post-create by deploy.sh (same
    // as admin-api — the WS API isn't suffixed/known at synth). NOT a security boundary: the
    // runtime pre-check + Gateway interceptor already deny a lapsed grant per-user on the next call.
    const entitlementsSweeperLambda = new lambda.Function(this, 'EntitlementsSweeperLambda', {
      functionName: sfx('agentcore-demo-entitlements-sweeper'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/entitlements-sweeper')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        ENTITLEMENTS_TABLE: entitlementsTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        WS_ENDPOINT: '',   // injected post-create by deploy.sh (same as adminApiLambda)
      },
    });
    entitlementsTable.grantReadWriteData(entitlementsSweeperLambda);  // flip lapsed grants + strip expiry
    connectionsTable.grantReadWriteData(entitlementsSweeperLambda);   // find live conns + prune Gone
    entitlementsSweeperLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/*`],
    }));
    // Run every minute — the granularity of "your access just expired" the UI reflects. Lazy
    // expiry is exact-to-the-second at enforcement regardless of this cadence.
    new events.Rule(this, 'EntitlementsSweeperSchedule', {
      ruleName: sfx('agentcore-demo-entitlements-sweeper'),
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new eventsTargets.LambdaFunction(entitlementsSweeperLambda)],
    });

    // ========== LAMBDA: Gateway REQUEST interceptor (platform per-user boundary) ==========
    // Attached to the AgentCore Gateway as a REQUEST interceptor (wired in deploy.sh via
    // update-gateway --interceptor-configurations). It reads the forwarded end-user JWT and
    // the entitlements table and DENIES a tools/call at the MCP boundary itself when the user
    // lacks the tool grant — the strongest, platform-level per-user enforcement (the Gateway's
    // own AWS_IAM authorizer can't see the human, only the agent role). Dependency-free at
    // runtime except entitlements.py (copied in by deploy.sh) + jwt for decode (bundled).
    const gatewayInterceptorLambda = new lambda.Function(this, 'GatewayInterceptorLambda', {
      functionName: sfx('agentcore-demo-gateway-interceptor'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/gateway-interceptor'), {
        // Hash the BUNDLED OUTPUT, not the source dir (the CDK default, SOURCE). This Lambda's
        // bundling pins a native wheel's platform; with SOURCE hashing, changing the bundling
        // command alone does NOT bust the cached asset, so CDK would keep shipping a stale
        // (wrong-arch) bundle and even overwrite a hand-patched Lambda on the next deploy. OUTPUT
        // hashing keys on the actual produced bytes, so a corrected wheel yields a new hash and
        // is redeployed. (Verified: this is what forces the x86_64 cryptography wheel to ship.)
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // UNLIKE the other Lambdas, this one has a NATIVE dependency (`cryptography`,
                // for PyJWT RS256). A plain host `pip install` on a Mac (arm64) bundles an arm64
                // wheel that the x86_64 Lambda rejects at import with "invalid ELF header" — which
                // silently disabled JWT verification (the Harness principal path) in production.
                // So pin the wheel platform to the Lambda's arch: manylinux2014_x86_64 / cp312 /
                // binary-only. cryptography ships an abi3 wheel (version-agnostic), so this resolves
                // the correct Linux wheel regardless of the build host. `cp -a` adds the source.
                // outputDir is CDK's synth-time staging path (not user input); pass it through the
                // environment rather than interpolating into the shell string, so a path with
                // spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && PIP=pip; } || { command -v pip3 >/dev/null 2>&1 && PIP=pip3; } || PIP="python3 -m pip"; ' +
                  '$PIP install -r requirements.txt -t "$ASSET_OUTPUT_DIR" ' +
                  '--platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade; ' +
                  'cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/gateway-interceptor'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: [
            // Docker fallback: the bundling image is already linux/x86_64, so a normal install
            // yields correct wheels. (Kept for hosts without a local pip.)
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        ENTITLEMENTS_TABLE: entitlementsTable.tableName,
        // The interceptor VERIFIES the forwarded Authorization JWT (RS256 sig + issuer + client)
        // and derives the caller from that sub — same pool/client the runtime validates against.
        // The runtime-asserted __principal is cross-checked against it (impersonation guard).
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        // For the OpenAPI positions-db target, the interceptor OVERWRITES arguments.principal_sub
        // with the crypto-verified sub before forwarding (so the DB's RLS scope can't be spoofed by
        // a model-supplied value). Naming the target here keeps that injection scoped to it.
        GOVERNED_DB_TARGET: 'positions-db',
        // Fixed-window rate-limit counter table (per-user / per-app / per-tool). Empty disables the
        // throttle (fail-open). RATE_LIMITS_JSON (optional) can dial caps down for a live demo.
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
      },
    });
    entitlementsTable.grantReadData(gatewayInterceptorLambda);
    rateLimitTable.grantReadWriteData(gatewayInterceptorLambda);  // atomic per-call counter ADD + read-back
    // Allow the AgentCore Gateway service to invoke the interceptor Lambda. The gateway role
    // already has lambda:InvokeFunction *, but the service principal also needs resource-policy
    // permission (belt-and-suspenders; deploy.sh confirms the exact principal at wire time).
    gatewayInterceptorLambda.addPermission('AllowAgentCoreInvoke', {
      principal: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    // ========== LAMBDA: Observability read-back ==========
    // Reads REAL CloudWatch GenAI Observability telemetry back for the in-app panel:
    // token usage + model latency via Metrics Insights over the `bedrock-agentcore`
    // namespace, per-model breakdown, and the console deep-link. RUNTIME_ID is injected
    // by deploy.sh after the runtime is created (same pattern as the websocket Lambda),
    // since the runtime is provisioned by the CLI after this stack.
    const observabilityLambda = new lambda.Function(this, 'ObservabilityLambda', {
      functionName: sfx('agentcore-demo-observability'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/observability'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/observability'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        ACCOUNT_ID: this.account,
        RUNTIME_ID: '', // set by deploy.sh post-runtime-create
      },
    });

    // Read-only CloudWatch metrics + logs (no mutate). Scoped to the actions the
    // read-back uses; resources '*' because GetMetricData / Logs Insights are account-wide.
    observabilityLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricData',
        'cloudwatch:ListMetrics',
        'logs:StartQuery',
        'logs:GetQueryResults',
        'logs:DescribeLogGroups',
        'xray:GetTraceSummaries',
        'xray:BatchGetTraces',
      ],
      resources: ['*'],
    }));

    // ========== LAMBDA: AgentCore ops-plane (Evaluations / Registry / Harness / Optimization) ==========
    // One path-dispatched Lambda backing the four newer AgentCore primitives (same "one function,
    // several routes" shape as the observability Lambda). GET routes are open to any authed user;
    // curate/recommend/experiment are admin-gated INSIDE the Lambda on the verified cognito:groups.
    // Resource IDs (registry/harness/evaluator/online-eval-config/bundle) are created by the CLI in
    // deploy.sh after this stack, so they arrive as env vars post-deploy (empty placeholders here).
    const primitivesLambda = new lambda.Function(this, 'AgentCorePrimitivesLambda', {
      functionName: sfx('agentcore-demo-primitives'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/agentcore-primitives'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/agentcore-primitives'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(60), // invoke_harness / evaluate can be slower than a metric read
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REGION: this.region,
        ACCOUNT_ID: this.account,
        // All injected post-create by deploy.sh (the primitives are CLI-provisioned after synth):
        RUNTIME_ID: '',
        SPANS_LOG_GROUP: 'aws/spans',
        EVAL_CUSTOM_EVALUATOR_ID: '',
        EVAL_BUILTIN_ARNS: '',
        EVAL_ONLINE_CONFIG_ID: '',
        REGISTRY_ID: '',
        HARNESS_ARN: '',
        OPT_EXPERIMENT_FLAG: 'off',
        OPT_CONTROL_BUNDLE_ID: '',
        OPT_TREATMENT_BUNDLE_ID: '',
      },
    });
    // Control + data plane for the four primitives, scoped to this account/region's
    // bedrock-agentcore namespace (specific resource IDs are deploy.sh-created, not known at
    // synth). Broad action verb retained for the same SDK-version reason as policy-toggle/
    // admin-api; PROD should pin to the specific resource ARNs.
    primitivesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:*'],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`],
    }));
    // The Optimization A/B toggle calls UpdateAgentRuntime, which re-passes the runtime's execution
    // role to the AgentCore service — so this Lambda needs iam:PassRole on EXACTLY that role
    // (verified live: without it the toggle fails AccessDenied and the fail-safe leaves the flag
    // unchanged). Scoped to the one role + conditioned on the AgentCore service principal, so it
    // can't be used to pass any other role. Least-privilege — not a bare PassRole '*'.
    primitivesLambda.addToRolePolicy(new iam.PolicyStatement({
      sid: 'PassRuntimeRoleForAbToggle',
      actions: ['iam:PassRole'],
      resources: [agentRuntimeRole.roleArn],
      conditions: { StringEquals: { 'iam:PassedToService': 'bedrock-agentcore.amazonaws.com' } },
    }));
    // Read-only CloudWatch/Logs for Evaluations + Optimization score read-back (no mutate).
    // Resources '*' because GetMetricData / Logs Insights are account-wide, matching observability.
    primitivesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricData',
        'cloudwatch:ListMetrics',
        'logs:StartQuery',
        'logs:GetQueryResults',
        'logs:DescribeLogGroups',
      ],
      resources: ['*'],
    }));
    // Evaluations LLM-as-judge + Optimization recommendations invoke Bedrock models under this
    // role when the primitive runs synchronously; scope to Bedrock InvokeModel (foundation models).
    primitivesLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // ========== LAMBDA: bond-tools (governed FI data/analytics for the swarm) ==========
    // The fixed-income tools the agent calls: bond_screen / curve_lookup / spread_lookup /
    // price_bond / portfolio_risk over the REAL universe snapshot in S3. Reached two ways:
    // the agent's direct-invoke path (lambda:InvokeFunction) and a Cognito-authorized HTTP
    // route /bonds/{action} (for the frontend / probes). Dependency-free (boto3 only).
    const bondToolsLambda = new lambda.Function(this, 'BondToolsLambda', {
      functionName: sfx('agentcore-demo-bond-tools'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/bond-tools')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        MARKET_BUCKET: marketBucket.bucketName,
      },
    });
    marketBucket.grantRead(bondToolsLambda);
    // The agent runtime role invokes this tool Lambda directly (like the userdata fallback).
    agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [bondToolsLambda.functionArn],
    }));

    // ========== LAMBDAS: per-vertical tools (insurance / banking / fintech) ==========
    // Sibling desks to the fixed-income bond-tools Lambda. Each is a self-contained,
    // dependency-free (boto3/stdlib only) Lambda exposing its vertical's governed data/
    // analytics tools, reached through the SAME AgentCore Gateway (Cedar-policy-enforced MCP)
    // as bond-tools — deploy.sh registers one create-gateway-target per Lambda. The Gateway
    // role already allows lambda:InvokeFunction on '*', so no per-target grant is needed. The
    // runtime role is ALSO granted direct invoke as a defensive parity with bond-tools.
    //
    // `usesMarket` verticals read the REAL universe snapshot from marketBucket (like bond-tools):
    // insurance is anchored to the FEMA National Risk Index, banking + fintech to real FRED series
    // (rates/credit-performance and consumer-credit) via their respective *-ingest Lambdas. All
    // three read the shared marketBucket, so all get S3 read + MARKET_BUCKET.
    const verticalTools: { id: string; name: string; usesMarket?: boolean }[] = [
      { id: 'InsuranceToolsLambda', name: 'agentcore-demo-insurance-tools', usesMarket: true },
      { id: 'BankingToolsLambda', name: 'agentcore-demo-banking-tools', usesMarket: true },
      { id: 'FintechToolsLambda', name: 'agentcore-demo-fintech-tools', usesMarket: true },
    ];
    for (const vt of verticalTools) {
      const dir = vt.name.replace('agentcore-demo-', ''); // insurance-tools / banking-tools / fintech-tools
      const fn = new lambda.Function(this, vt.id, {
        functionName: sfx(vt.name),
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, `../lambda/${dir}`)),
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        tracing: lambda.Tracing.ACTIVE,
        environment: vt.usesMarket ? { MARKET_BUCKET: marketBucket.bucketName } : undefined,
      });
      if (vt.usesMarket) {
        marketBucket.grantRead(fn);
      }
      agentRuntimeRole.addToPolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [fn.functionArn],
      }));
      new cdk.CfnOutput(this, `${vt.id}Arn`, { value: fn.functionArn });
    }

    // ========== POSITIONS DB: identity-governed Aurora (the first NON-Lambda Gateway target) ==========
    // A relational (Aurora PostgreSQL Serverless v2) "client holdings ledger" reached through the
    // AgentCore Gateway as an OpenAPI target (NOT a Lambda target) — the point of this feature is a
    // governed tool whose backend is a database, with access filtered by the caller's VERIFIED
    // identity two ways at once:
    //   • ROW-level  — Postgres RLS scopes rows to the caller's DESK (capital_markets vs banking …).
    //   • COLUMN-level — a governed view masks client PII + notional unless the caller's TIER is senior.
    // The SQL runs behind a thin resolver Lambda over the RDS Data API (so the *caller* never needs a
    // VPC), but the Gateway TARGET is an OpenAPI/HTTP endpoint — the resolver is an implementation
    // detail behind the API, not the tool surface. See lambda/positions-db-resolver + scripts/seed_holdings.py.
    //
    // Cost posture (demo): Serverless v2 scale-to-zero (min 0 ACU) → storage-only when idle, ~10-15s
    // cold resume on first query. RemovalPolicy.DESTROY + a short backup so cleanup.sh tears it down
    // cleanly; PROD would RETAIN, rotate the master secret, and use isolated multi-AZ writers.
    //
    // This is the repo's FIRST VPC. It is minimal and self-contained: 2 AZs, ISOLATED subnets only
    // (no NAT, no IGW — the cluster needs no internet egress, and the Data API is a public AWS API
    // the resolver reaches from outside the VPC). Nothing else in the stack attaches to it.
    const dbVpc = new ec2.Vpc(this, 'PositionsDbVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'db-isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'PositionsDbSg', {
      vpc: dbVpc,
      description: 'Aurora positions-db - no inbound from outside the VPC (Data API access only).',
      allowAllOutbound: true,
    });

    // Master credentials — CDK generates + stores the secret; the Data API authenticates with the
    // secret ARN, so the resolver never sees a raw password. Reuses the same synthetic-secret idiom
    // as VaultSecret (DESTROY for demo teardown).
    const positionsDbCluster = new rds.DatabaseCluster(this, 'PositionsDbCluster', {
      clusterIdentifier: sfx('agentcore-demo-positions-db'),
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_8,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('holdingsadmin', {
        secretName: sfx('agentcore-demo-positions-db-master'),
      }),
      defaultDatabaseName: 'positions',
      enableDataApi: true, // caller uses rds-data:ExecuteStatement — no VPC attachment needed.
      serverlessV2MinCapacity: 0, // scale-to-zero when idle (storage-only cost).
      serverlessV2MaxCapacity: 1,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      vpc: dbVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      backup: { retention: cdk.Duration.days(1) },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Shared API key: the Gateway (OpenAPI target, API_KEY credential provider) injects this as a
    // header when it calls the resolver; the resolver validates the header against the SAME value.
    // OpenAPI targets can't use GATEWAY_IAM_ROLE (Lambda-only), so this key is the outbound auth.
    // CDK generates it once; deploy.sh reads it to register the api-key credential provider.
    const positionsDbGwKeySecret = new secretsmanager.Secret(this, 'PositionsDbGwKeySecret', {
      secretName: sfx('agentcore-demo-positions-db-gwkey'),
      description: 'Shared API key the Gateway injects to call the positions-db resolver (demo).',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      generateSecretString: {
        // A single opaque key under `apiKey` (no punctuation that would need URL/header escaping).
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'apiKey',
        excludePunctuation: true,
        passwordLength: 48,
      },
    });

    // Resolver Lambda — behind the HTTP API, NOT VPC-attached (Data API is a public AWS API). It
    // sets the RLS principal in a Data API transaction and selects the governed view. boto3/stdlib
    // only (zip-from-asset, same as the vertical tool Lambdas).
    const positionsDbResolverLambda = new lambda.Function(this, 'PositionsDbResolverLambda', {
      functionName: sfx('agentcore-demo-positions-db-resolver'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/positions-db-resolver')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        DB_CLUSTER_ARN: positionsDbCluster.clusterArn,
        DB_SECRET_ARN: positionsDbCluster.secret!.secretArn,
        DB_NAME: 'positions',
        GW_KEY_SECRET_ARN: positionsDbGwKeySecret.secretArn,
      },
    });
    // Least-privilege: only rds-data on THIS cluster + read the two secrets it needs.
    positionsDbResolverLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [positionsDbCluster.clusterArn],
    }));
    positionsDbCluster.secret!.grantRead(positionsDbResolverLambda);
    positionsDbGwKeySecret.grantRead(positionsDbResolverLambda);

    // HTTP API fronting the resolver — this URL is what the OpenAPI schema points at, and what the
    // AgentCore Gateway calls. Auth to it is the injected API key (validated in the resolver), NOT a
    // Cognito JWT authorizer — the end-user JWT is consumed by the Gateway's own inbound authorizer
    // and the per-user identity arrives as the interceptor-injected principal_sub in the body.
    const positionsDbApi = new apigateway.HttpApi(this, 'PositionsDbApi', {
      apiName: sfx('agentcore-demo-positions-db-api'),
      corsPreflight: {
        allowOrigins: corsAllowOrigins,
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: apiCorsHeaders,
      },
    });
    positionsDbApi.addRoutes({
      path: '/holdings',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'PositionsDbIntegration', positionsDbResolverLambda,
      ),
    });

    // ========== WEBSOCKET API ==========
    const webSocketApi = new apigateway.WebSocketApi(this, 'AgentCoreWsApi', {
      apiName: sfx('agentcore-demo-ws'),
    });

    const webSocketStage = new apigateway.WebSocketStage(this, 'AgentCoreWsStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
      // Stage-level throttle (same abuse/cost guardrail as the HTTP APIs).
      throttle: { rateLimit: 50, burstLimit: 100 },
    });

    // NOTE: $connect has NO Gateway-level authorizer here. The chat path is still authenticated
    // — the websocket Lambda validates the Cognito token's structure/expiry at connect and the
    // AUTHORITATIVE RS256 JWT check happens at the runtime's customJWTAuthorizer on every bearer
    // invoke (see agent/main.py _verify_cognito_token / lambda/websocket). PROD SHOULD ADD a
    // WebSocketLambdaAuthorizer (or a REQUEST authorizer) on $connect so an unauthenticated
    // socket is rejected at the Gateway before the Lambda is ever invoked; it's omitted here to
    // avoid the extra authorizer Lambda + wiring for the demo. Documented, not silently dropped.

    const wsLambdaIntegration = new apigatewayIntegrations.WebSocketLambdaIntegration(
      'WsLambdaIntegration',
      websocketLambda,
    );

    webSocketApi.addRoute('$connect', { integration: wsLambdaIntegration });
    webSocketApi.addRoute('$disconnect', { integration: wsLambdaIntegration });
    webSocketApi.addRoute('sendMessage', { integration: wsLambdaIntegration });

    // Reusing one WebSocketLambdaIntegration across routes makes CDK emit the
    // lambda:InvokeFunction permission for only the FIRST route ($connect). Without
    // this, API Gateway cannot invoke the Lambda for sendMessage/$disconnect and
    // those routes fail with "Internal server error". Grant invoke for ALL routes
    // on this API explicitly (matches the live env's hand-added wildcard).
    websocketLambda.addPermission('WsInvokeAllRoutes', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`,
    });

    // Allow the websocket Lambda to push messages back to connected clients.
    webSocketStage.grantManagementApiAccess(websocketLambda);

    // execute-api:ManageConnections on this specific API (belt-and-suspenders
    // alongside grantManagementApiAccess, which grants on the stage resource).
    websocketLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`,
      ],
    }));

    // ========== API GATEWAY (HTTP API) ==========
    const httpApi = new apigateway.HttpApi(this, 'AgentCoreApi', {
      apiName: sfx('agentcore-demo-api'),
      // CORS locked to the CloudFront origin (deploy.sh re-locks post-deploy when the domain
      // is known); allowHeaders restricted to the exact headers the SPA sends. See the
      // corsAllowOrigins/apiCorsHeaders definitions near the top of the constructor.
      corsPreflight: {
        allowOrigins: corsAllowOrigins,
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: apiCorsHeaders,
      },
    });

    const cognitoAuthorizer = new apigatewayAuthorizers.HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      userPool,
      { userPoolClients: [userPoolClient] },
    );

    // POST /policy/toggle - toggle Cedar policy (isolated role holds admin perms)
    httpApi.addRoutes({
      path: '/policy/toggle',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('PolicyToggleIntegration', policyToggleLambda),
      authorizer: cognitoAuthorizer,
    });

    // Admin RBAC control plane + self-service entitlement read. All Cognito-authorized;
    // the admin routes are ALSO gated inside the Lambda by the caller's cognito:groups
    // (admins), so a valid non-admin token is rejected server-side, not just hidden in the UI.
    const adminApiIntegration = new apigatewayIntegrations.HttpLambdaIntegration('AdminApiIntegration', adminApiLambda);
    httpApi.addRoutes({
      path: '/admin/{proxy+}',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: adminApiIntegration,
      authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/me/entitlements',
      methods: [apigateway.HttpMethod.GET],
      integration: adminApiIntegration,
      authorizer: cognitoAuthorizer,
    });
    // Self-service access requests: any authenticated (non-admin) user may CREATE a request
    // for a desk/tool they lack and LIST their own requests. Handled by the same admin-api
    // Lambda but resolved BEFORE its admin gate (like /me/entitlements). The admin-side
    // list/approve/deny routes live under the /admin/{proxy+} catch-all above (no extra route).
    httpApi.addRoutes({
      path: '/me/access-requests',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: adminApiIntegration,
      authorizer: cognitoAuthorizer,
    });

    // GET /observability - read-back of real CloudWatch GenAI Observability telemetry
    // (token usage, model latency, per-model breakdown, console deep-link).
    httpApi.addRoutes({
      path: '/observability',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('ObservabilityIntegration', observabilityLambda),
      authorizer: cognitoAuthorizer,
    });

    // GET /trace?session_id=... - per-turn execution trace from real CloudWatch
    // Transaction Search spans (aws/spans), reduced to per-agent / per-tool / per-model
    // durations + tokens. Served by the same observability Lambda (shares its Logs
    // Insights perms). Cognito-authorized like the rest.
    httpApi.addRoutes({
      path: '/trace',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('TraceIntegration', observabilityLambda),
      authorizer: cognitoAuthorizer,
    });

    // AgentCore ops-plane routes (Evaluations / Registry / Harness / Optimization). All
    // Cognito-authorized; curate/recommend/experiment are additionally admin-gated inside the
    // Lambda on the verified cognito:groups. One shared integration across every route.
    const primitivesIntegration = new apigatewayIntegrations.HttpLambdaIntegration('PrimitivesIntegration', primitivesLambda);
    for (const r of [
      { path: '/evaluations', methods: [apigateway.HttpMethod.GET] },
      { path: '/evaluations/run', methods: [apigateway.HttpMethod.POST] },
      { path: '/registry', methods: [apigateway.HttpMethod.GET] },
      { path: '/registry/search', methods: [apigateway.HttpMethod.POST] },
      { path: '/registry/curate', methods: [apigateway.HttpMethod.POST] },
      { path: '/harness', methods: [apigateway.HttpMethod.GET] },
      { path: '/harness/versions', methods: [apigateway.HttpMethod.GET] },
      { path: '/harness/endpoint', methods: [apigateway.HttpMethod.POST] },
      { path: '/harness/invoke', methods: [apigateway.HttpMethod.POST] },
      { path: '/optimization', methods: [apigateway.HttpMethod.GET] },
      { path: '/optimization/recommend', methods: [apigateway.HttpMethod.POST] },
      { path: '/optimization/experiment', methods: [apigateway.HttpMethod.POST] },
    ]) {
      httpApi.addRoutes({
        path: r.path,
        methods: r.methods,
        integration: primitivesIntegration,
        authorizer: cognitoAuthorizer,
      });
    }

    // POST /bonds/{action} - the fixed-income tools over the real universe (Cognito-auth).
    // The agent reaches these by direct Lambda invoke; this HTTP route is for the frontend
    // (e.g. rendering the live curve/universe panels) and for probes.
    httpApi.addRoutes({
      path: '/bonds/{action}',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('BondToolsIntegration', bondToolsLambda),
      authorizer: cognitoAuthorizer,
    });

    // ========== LAMBDA: OAuth2 3LO callback (session binding) ==========
    // The public HTTPS endpoint AgentCore Identity redirects the browser to after
    // the user consents. It calls CompleteResourceTokenAuth to finalize the
    // user-delegated token. Bundles a current boto3 (built-in lacks the op).
    const oauthCallbackLambda = new lambda.Function(this, 'OAuthCallbackLambda', {
      functionName: sfx('agentcore-demo-oauth-callback'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/oauth-callback'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/oauth-callback'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: ['bash', '-c', 'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: { REGION: this.region, OAUTH_SESSIONS_TABLE: oauthSessionsTable.tableName },
    });
    // oauth-callback calls CompleteResourceTokenAuth on the identity data plane. Scope the
    // RESOURCE to this account+region's bedrock-agentcore namespace (the workload-identity /
    // credential-provider ids are deploy.sh-created). Broad action verb retained for the same
    // SDK-version reason as the other control-plane Lambdas above.
    oauthCallbackLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:*'],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));
    // CompleteResourceTokenAuth reads the credential provider's client secret from
    // the identity-managed Secrets Manager secret, so the callback role needs it too
    // (same grant the runtime role has).
    oauthCallbackLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:bedrock-agentcore-identity!default/oauth2/*`,
      ],
    }));
    // Read + WRITE: the callback CONSUMES (delete_item) the single-use binding nonce after it
    // dereferences it to the stashed JWT, so a replayed callback finds nothing and fails closed.
    oauthSessionsTable.grantReadWriteData(oauthCallbackLambda);

    // ========== LAMBDA: Demo Reset (operator tool, no route) ==========
    // Invoked MANUALLY between demos to wipe extracted memories + reset the positions
    // table to baseline. Not attached to any API. MEMORY_ID + the PM subs are
    // set by deploy.sh after those resources exist.
    const demoResetLambda = new lambda.Function(this, 'DemoResetLambda', {
      functionName: sfx('agentcore-demo-reset'),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/demo-reset'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                // outputDir is CDK's synth-time staging path (not user input); pass it
                // through the environment rather than interpolating into the shell string,
                // so a path with spaces/metacharacters can't break or inject into the command.
                cp.execSync(
                  '{ command -v pip >/dev/null 2>&1 && pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || { command -v pip3 >/dev/null 2>&1 && pip3 install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; } || python3 -m pip install -r requirements.txt -t "$ASSET_OUTPUT_DIR"; cp -a . "$ASSET_OUTPUT_DIR/"',
                  { cwd: path.join(__dirname, '../lambda/demo-reset'), stdio: 'inherit', env: { ...process.env, ASSET_OUTPUT_DIR: outputDir } },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          command: ['bash', '-c', 'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'],
        },
      }),
      timeout: cdk.Duration.minutes(2),
      tracing: lambda.Tracing.ACTIVE,
      // USER_POOL_ID lets reset resolve every demo user's Cognito sub by email, so it restores
      // baseline positions + wipes memory across ALL FOUR persona desks (not just Alice/Bob).
      environment: {
        REGION: this.region,
        GRADES_TABLE: gradesTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
    });
    demoResetLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:ListMemoryRecords', 'bedrock-agentcore:DeleteMemoryRecord',
                'bedrock-agentcore:BatchDeleteMemoryRecords'],
      // Memory id is deploy.sh-created (not known at synth) → scope resource to this
      // account+region's bedrock-agentcore namespace rather than a bare '*'.
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
      ],
    }));
    // Resolve demo-user emails → subs at reset time (covers all four verticals' users).
    demoResetLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn],
    }));
    gradesTable.grantReadWriteData(demoResetLambda);

    // GET /oauth/callback - UNAUTHENTICATED (the browser arrives here via redirect
    // from the IdP, with no app JWT). Binding security comes from the session_uri +
    // custom_state(user_id) presented to CompleteResourceTokenAuth.
    httpApi.addRoutes({
      path: '/oauth/callback',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('OAuthCallbackIntegration', oauthCallbackLambda),
    });

    // ========== GRADES API (HTTP API w/ Cognito JWT authorizer + scopes) ==========
    // Separate API so the Grades resource is genuinely its own audience. The JWT
    // authorizer validates Cognito access tokens against the user pool issuer; each
    // route additionally requires the matching grades-api/* scope, so the
    // user-delegated token must actually carry that scope to succeed.
    const gradesApi = new apigateway.HttpApi(this, 'GradesApi', {
      apiName: sfx('agentcore-demo-grades-api'),
      // CORS locked to the CloudFront origin (deploy.sh re-locks post-deploy).
      corsPreflight: {
        allowOrigins: corsAllowOrigins,
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: apiCorsHeaders,
      },
    });

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const gradesJwtAuthorizer = new apigatewayAuthorizers.HttpJwtAuthorizer(
      'GradesJwtAuthorizer',
      issuer,
      {
        // Cognito access tokens put the resource-server identifier in `aud`/`client_id`;
        // AgentCore's delegated token is issued for the grades OAuth client.
        jwtAudience: [gradesOAuthClient.userPoolClientId],
      },
    );

    const gradesIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'GradesIntegration', gradesLambda,
    );

    gradesApi.addRoutes({
      path: '/grades',
      methods: [apigateway.HttpMethod.GET],
      integration: gradesIntegration,
      authorizer: gradesJwtAuthorizer,
      authorizationScopes: ['portfolio-api/read'],
    });
    gradesApi.addRoutes({
      path: '/grades/{category}',
      methods: [apigateway.HttpMethod.PUT],
      integration: gradesIntegration,
      authorizer: gradesJwtAuthorizer,
      authorizationScopes: ['portfolio-api/trade'],
    });

    // ========== MARKET-DATA API (HTTP API w/ Cognito JWT authorizer, M2M scope) ==========
    // The M2M downstream. Its own audience so the machine flow is cleanly separated
    // from the per-user Grades resource. A Cognito client_credentials access token has
    // no user `sub` and surfaces the app in `client_id`; the HTTP API JWT authorizer
    // matches the configured audience against the token's `aud` OR `client_id` claim
    // (the same reason the Grades authorizer below works with a client id), so we set
    // the audience to the M2M client id. The `market-data/read` scope requirement then
    // proves the token was minted for THIS resource server.
    const marketApi = new apigateway.HttpApi(this, 'MarketDataApi', {
      apiName: sfx('agentcore-demo-market-data-api'),
      // CORS locked to the CloudFront origin (deploy.sh re-locks post-deploy).
      corsPreflight: {
        allowOrigins: corsAllowOrigins,
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: apiCorsHeaders,
      },
    });

    const marketJwtAuthorizer = new apigatewayAuthorizers.HttpJwtAuthorizer(
      'MarketDataJwtAuthorizer',
      issuer,
      {
        jwtAudience: [marketDataM2MClient.userPoolClientId],
      },
    );

    marketApi.addRoutes({
      path: '/market/{dataset}',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('MarketDataIntegration', marketDataLambda),
      authorizer: marketJwtAuthorizer,
      authorizationScopes: ['market-data/read'],
    });

    // ---- HTTP API throttling (abuse / runaway-cost guardrail) --------------------------------
    // Set a stage-level default-route throttle (steady-state rate + burst) on each HTTP API's
    // auto-created $default stage. This caps request rate account-wide per API even before any
    // WAF. Values are generous for a demo (a live SA click-through is nowhere near this) but stop
    // a loop/abuse from running up cost or hammering the Lambdas. A full WAF WebACL is left as a
    // TODO below (heavier for a demo); throttling is the required minimum.
    const throttleHttpApi = (api: apigateway.HttpApi) => {
      const stage = api.defaultStage?.node.defaultChild as apigateway.CfnStage | undefined;
      if (stage) {
        stage.defaultRouteSettings = {
          throttlingRateLimit: 50,   // steady-state requests/sec across the API
          throttlingBurstLimit: 100, // max concurrent burst
        };
      }
    };
    throttleHttpApi(httpApi);
    throttleHttpApi(gradesApi);
    throttleHttpApi(marketApi);
    // TODO(prod): front CloudFront + the HTTP APIs with an AWS WAF WebACL (webAclId) using the
    // managed rule sets AWSManagedRulesCommonRuleSet + AWSManagedRulesAmazonIpReputationList +
    // AWSManagedRulesKnownBadInputsRuleSet, plus a rate-based rule. Omitted here to keep the demo
    // light (WAF has standing cost and adds deploy complexity a demo account may not want).

    // ========== S3 + CLOUDFRONT (Frontend) ==========
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: env ? `agentcore-demo-web-${env}-${this.account}` : `agentcore-demo-web-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // Deny non-TLS. CloudFront (OAC) already reaches the origin over HTTPS, so no demo impact.
      enforceSSL: true,
    });

    // Execution role the AgentCore Browser assumes to write session recordings to
    // S3. create-browser only accepts --recording at creation time (there is no
    // update-browser), so deploy.sh wires this role + the recording target when it
    // creates the browser. Recordings land under browser-recordings/ in the website
    // bucket and are viewable in the AgentCore console.
    const browserRole = new iam.Role(this, 'BrowserRole', {
      roleName: sfx('agentcore-demo-browser-role'),
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });
    websiteBucket.grantReadWrite(browserRole);

    // ========== AgentCore Evaluations execution role ==========
    // The role AgentCore Evaluations assumes to (a) read the runtime's OTEL spans from
    // CloudWatch, (b) invoke the Bedrock judge model for the custom governance evaluator, and
    // (c) write results to the evaluations results log group. Trust + permissions are fully
    // static (per the AgentCore Evaluations prerequisites doc), so they live here in CDK; the
    // online-eval config that references this role is created by deploy.sh after the runtime
    // exists. Name must start with "AgentCoreEvaluationRole" so the operator's PassRole grant
    // (scoped to role/AgentCoreEvaluationRole*) can pass it to bedrock-agentcore.
    const evalExecRole = new iam.Role(this, 'EvalExecutionRole', {
      roleName: sfx('AgentCoreEvaluationRole'),
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': [
              `arn:aws:bedrock-agentcore:${this.region}:${this.account}:evaluator/*`,
              `arn:aws:bedrock-agentcore:${this.region}:${this.account}:online-evaluation-config/*`,
            ],
          },
        },
      }),
    });
    evalExecRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogRead',
      actions: ['logs:DescribeLogGroups', 'logs:GetQueryResults', 'logs:StartQuery'],
      resources: ['*'],
    }));
    evalExecRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogWrite',
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/evaluations/*`],
    }));
    evalExecRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchIndexPolicy',
      actions: ['logs:DescribeIndexPolicies', 'logs:PutIndexPolicy'],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:aws/spans`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:aws/spans:*`,
      ],
    }));
    evalExecRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockInvokeJudge',
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      // The governance judge defaults to a cross-region inference profile (us.anthropic.claude-
      // sonnet-4-6), which routes to the underlying foundation model in ANY of the profile's
      // member regions (us-east-1/us-east-2/us-west-2), not just this stack's region. So the
      // grant must cover the inference-profile ARN AND foundation-model ARNs in every region the
      // profile may route to — a region-scoped foundation-model ARN fails with "the provided
      // execution role does not have permissions to invoke the specified Bedrock models".
      // Verified live. (Mirrors the runtime role's cross-region grant.) Scope to specific model
      // ids for production.
      resources: [
        'arn:aws:bedrock:*::foundation-model/*',
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
      ],
    }));

    // ========== AgentCore Harness execution role ==========
    // The role the config-only "Meridian Express" harness assumes. It reuses the SAME AgentCore
    // Memory + Gateway the Runtime desks use (by ARN), so its policy grants Bedrock model
    // invocation, ECR-public pull (harness pulls its managed container per session), CloudWatch
    // logs/metrics + X-Ray, workload identity, Memory events, and Gateway invoke. Trust +
    // permissions are static (per the harness-security doc), so the role lives in CDK; the
    // harness itself is created by deploy.sh (needs the Memory/Gateway ids that exist post-CLI).
    const harnessRole = new iam.Role(this, 'HarnessExecutionRole', {
      roleName: sfx('agentcore-demo-harness-role'),
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockModelInvocation',
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:*`,
      ],
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPublicPull',
      actions: ['ecr-public:GetAuthorizationToken', 'sts:GetServiceBearerToken'],
      resources: ['*'],
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'XRayTracing',
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords', 'xray:GetSamplingRules', 'xray:GetSamplingTargets'],
      resources: ['*'],
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogs',
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogGroups', 'logs:DescribeLogStreams'],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:*`,
      ],
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchMetrics',
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: { StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' } },
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'WorkloadIdentity',
      actions: ['bedrock-agentcore:GetWorkloadAccessToken', 'bedrock-agentcore:GetWorkloadAccessTokenForJWT'],
      resources: [
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:workload-identity-directory/default`,
        `arn:aws:bedrock-agentcore:${this.region}:${this.account}:workload-identity-directory/default/workload-identity/harness_*`,
      ],
    }));
    // Reuse the shared Memory (events) + Gateway (invoke). Scoped to this account/region's
    // namespace since the concrete Memory/Gateway ids are deploy.sh-created (not known at synth).
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SharedMemoryAndGateway',
      actions: [
        'bedrock-agentcore:CreateEvent', 'bedrock-agentcore:GetEvent', 'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:RetrieveMemoryRecords', 'bedrock-agentcore:InvokeGateway',
      ],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`],
    }));
    // The harness now declares the managed Code Interpreter + Browser sandboxes as tools, so its
    // execution role must be able to start/drive those sessions. The DEFAULT (AWS-managed) sandbox
    // ARNs are under the `:aws:` namespace (arn:aws:bedrock-agentcore:<region>:aws:...), per the
    // harness-security execution-role sample. We grant the DEFAULT sandbox actions; a customer-
    // owned sandbox would additionally need its own `<account>:code-interpreter-custom/*` ARN.
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CodeInterpreterDefault',
      actions: [
        'bedrock-agentcore:StartCodeInterpreterSession', 'bedrock-agentcore:StopCodeInterpreterSession',
        'bedrock-agentcore:GetCodeInterpreterSession', 'bedrock-agentcore:ListCodeInterpreterSessions',
        'bedrock-agentcore:InvokeCodeInterpreter',
      ],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:aws:code-interpreter/*`],
    }));
    harnessRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BrowserDefault',
      actions: [
        'bedrock-agentcore:StartBrowserSession', 'bedrock-agentcore:StopBrowserSession',
        'bedrock-agentcore:GetBrowserSession', 'bedrock-agentcore:ListBrowserSessions',
        'bedrock-agentcore:UpdateBrowserStream', 'bedrock-agentcore:ConnectBrowserAutomationStream',
        'bedrock-agentcore:ConnectBrowserLiveViewStream',
      ],
      resources: [`arn:aws:bedrock-agentcore:${this.region}:aws:browser/*`],
    }));
    // NOTE: the harness does NOT call the governed Gateway (per-user OBO to a Cognito-JWT gateway
    // is not achievable — see the deploy.sh Harness block), so it needs no outbound OAuth2 token-
    // vault / secrets permissions. Its tools are the managed Code Interpreter + Browser sandboxes
    // (granted above) plus Memory (SharedMemoryAndGateway) — all under its own execution role.

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        // Origin Access Control (OAC) — the modern replacement for the legacy OAI.
        // CDK auto-generates the bucket policy granting the CloudFront service
        // principal s3:GetObject scoped to this distribution's ARN (AWS:SourceArn),
        // and OAC (unlike OAI) supports SSE-KMS + SigV4. The bucket stays
        // BLOCK_ALL public access; access is via the signed OAC request only.
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 },
      ],
    });

    // Deploy the React/AG-UI app (frontend-react/dist) — the ONE AND ONLY UI. The legacy
    // vanilla frontend/ was removed, so there is no stale fallback that could silently ship.
    // deploy.sh builds dist/ in STEP 0 (fail-fast) BEFORE the first cdk deploy, so real
    // deploys always ship the built app with the live config.js. dist/ is gitignored, so on
    // a fresh checkout (bare `cdk synth` / `npm test`, no build) it's absent — in that case
    // we ship a tiny inline placeholder purely so synth/tests succeed. It is NEVER used by a
    // real deploy, which always builds dist/ first.
    const reactDist = path.join(__dirname, '../frontend-react/dist');
    const frontendSources = fs.existsSync(reactDist)
      ? [s3deploy.Source.asset(reactDist)]
      : [s3deploy.Source.data(
          'index.html',
          '<!doctype html><meta charset="utf-8"><title>Build the frontend</title>' +
          '<body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto">' +
          '<h1>Frontend not built</h1><p>This is the synth-time placeholder. Run ' +
          '<code>deploy.sh</code> (it builds <code>frontend-react/</code> in STEP 0) to ' +
          'ship the real AG-UI app.</p>')];
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: frontendSources,
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ========== OUTPUTS ==========
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'AgentCodeBucketName', { value: agentCodeBucket.bucketName });
    new cdk.CfnOutput(this, 'AgentRuntimeRoleArn', { value: agentRuntimeRole.roleArn });
    new cdk.CfnOutput(this, 'GatewayRoleArn', { value: gatewayRole.roleArn });
    new cdk.CfnOutput(this, 'BrowserRoleArn', { value: browserRole.roleArn });
    new cdk.CfnOutput(this, 'WebsiteBucketName', { value: websiteBucket.bucketName });
    new cdk.CfnOutput(this, 'VaultLambdaArn', { value: vaultLambda.functionArn });
    new cdk.CfnOutput(this, 'UserDataLambdaArn', { value: userDataLambda.functionArn });
    new cdk.CfnOutput(this, 'UserDataTableName', { value: userDataTable.tableName });
    new cdk.CfnOutput(this, 'EntitlementsTableName', { value: entitlementsTable.tableName });
    new cdk.CfnOutput(this, 'RateLimitTableName', { value: rateLimitTable.tableName });
    new cdk.CfnOutput(this, 'AccessRequestsTableName', { value: accessRequestsTable.tableName });
    new cdk.CfnOutput(this, 'AdminApiLambdaName', { value: adminApiLambda.functionName });
    new cdk.CfnOutput(this, 'EntitlementsSweeperLambdaName', { value: entitlementsSweeperLambda.functionName });
    new cdk.CfnOutput(this, 'PrimitivesLambdaName', { value: primitivesLambda.functionName });
    new cdk.CfnOutput(this, 'EvalExecutionRoleArn', { value: evalExecRole.roleArn });
    new cdk.CfnOutput(this, 'HarnessExecutionRoleArn', { value: harnessRole.roleArn });
    new cdk.CfnOutput(this, 'GatewayInterceptorLambdaArn', { value: gatewayInterceptorLambda.functionArn });
    new cdk.CfnOutput(this, 'GatewayInterceptorLambdaName', { value: gatewayInterceptorLambda.functionName });
    new cdk.CfnOutput(this, 'CognitoDiscoveryUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}/.well-known/openid-configuration`,
    });
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: `${webSocketApi.apiEndpoint}/${webSocketStage.stageName}`,
    });
    // AG-UI bridge Function URL — the @ag-ui/client frontend SigV4-signs and POSTs here.
    new cdk.CfnOutput(this, 'AgUiUrl', { value: aguiFnUrl.url });
    new cdk.CfnOutput(this, 'AgUiBridgeFunctionName', { value: aguiBridgeLambda.functionName });
    // Identity Pool the browser uses to vend temp creds for SigV4 to the Function URL.
    new cdk.CfnOutput(this, 'AgUiIdentityPoolId', { value: identityPool.ref });
    new cdk.CfnOutput(this, 'ConnectionsTableName', { value: connectionsTable.tableName });
    new cdk.CfnOutput(this, 'EcrRepositoryUri', { value: ecrRepo.repositoryUri });

    // ---- Fixed-income (FI demo) outputs (consumed by deploy.sh) ----
    new cdk.CfnOutput(this, 'BondsTableName', { value: bondsTable.tableName });
    new cdk.CfnOutput(this, 'MarketBucketName', { value: marketBucket.bucketName });
    new cdk.CfnOutput(this, 'BondIngestLambdaArn', { value: bondIngestLambda.functionArn });
    new cdk.CfnOutput(this, 'BondIngestLambdaName', { value: bondIngestLambda.functionName });
    new cdk.CfnOutput(this, 'InsuranceTableName', { value: insuranceTable.tableName });
    new cdk.CfnOutput(this, 'InsuranceIngestLambdaName', { value: insuranceIngestLambda.functionName });
    new cdk.CfnOutput(this, 'BankingTableName', { value: bankingTable.tableName });
    new cdk.CfnOutput(this, 'BankingIngestLambdaName', { value: bankingIngestLambda.functionName });
    new cdk.CfnOutput(this, 'FintechTableName', { value: fintechTable.tableName });
    new cdk.CfnOutput(this, 'FintechIngestLambdaName', { value: fintechIngestLambda.functionName });
    new cdk.CfnOutput(this, 'BondToolsLambdaArn', { value: bondToolsLambda.functionArn });
    new cdk.CfnOutput(this, 'BondToolsLambdaName', { value: bondToolsLambda.functionName });

    // ---- Positions DB (identity-governed Aurora / OpenAPI gateway target) outputs ----
    new cdk.CfnOutput(this, 'PositionsDbClusterArn', { value: positionsDbCluster.clusterArn });
    new cdk.CfnOutput(this, 'PositionsDbSecretArn', { value: positionsDbCluster.secret!.secretArn });
    new cdk.CfnOutput(this, 'PositionsDbName', { value: 'positions' });
    new cdk.CfnOutput(this, 'PositionsDbApiUrl', { value: positionsDbApi.apiEndpoint });
    new cdk.CfnOutput(this, 'PositionsDbGwKeySecretArn', { value: positionsDbGwKeySecret.secretArn });

    // ---- AgentCore Identity / Grades outputs (consumed by deploy.sh) ----
    new cdk.CfnOutput(this, 'GradesApiUrl', { value: gradesApi.apiEndpoint });
    new cdk.CfnOutput(this, 'GradesTableName', { value: gradesTable.tableName });
    new cdk.CfnOutput(this, 'GradesOAuthClientId', { value: gradesOAuthClient.userPoolClientId });
    new cdk.CfnOutput(this, 'MarketDataApiUrl', { value: marketApi.apiEndpoint });
    new cdk.CfnOutput(this, 'MarketDataM2MClientId', { value: marketDataM2MClient.userPoolClientId });
    new cdk.CfnOutput(this, 'OAuthCallbackUrl', { value: `${httpApi.apiEndpoint}/oauth/callback` });
    new cdk.CfnOutput(this, 'CognitoDomainPrefix', { value: domainPrefix });
    new cdk.CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
