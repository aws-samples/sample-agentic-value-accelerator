# Govern Module Frontend Security Analysis

**Analysis Date:** 2026-07-22  
**Scope:** `src/components/govern/` and `src/api/client.ts`  
**Analyst:** Claude Security Review

---

## Executive Summary

The Govern module frontend demonstrates generally sound security practices with proper authentication integration via AWS Cognito, no dangerous patterns like `dangerouslySetInnerHTML` or `eval()`, and consistent use of the centralized API client with Bearer token authentication. However, several areas warrant attention, particularly around localStorage data exposure, console logging, input validation, and missing Content Security Policy considerations.

---

## Findings by Severity

### CRITICAL (Must Fix Before Merge)

**No critical findings identified.**

The codebase avoids the most dangerous security anti-patterns:
- No `dangerouslySetInnerHTML` usage
- No `eval()` or `new Function()` calls
- No direct `.innerHTML` assignments
- Authentication is enforced at the App level via `AuthGate` component

---

### HIGH (Fix Soon)

#### H1: Auth Token Stored in localStorage

**Location:** `src/api/client.ts` (lines 37-40, 64, 82, 103, 140), `src/auth/AuthContext.tsx` (lines 64, 82, 103)

**Issue:** JWT authentication tokens are stored in `localStorage`, making them vulnerable to XSS attacks. If any XSS vulnerability is introduced, attackers could steal auth tokens.

```typescript
localStorage.setItem('auth_token', idToken);
```

**Risk:** Token theft via XSS could lead to session hijacking.

**Recommendation:** 
- Consider using `httpOnly` cookies for token storage (requires backend changes)
- Alternatively, implement token refresh with short-lived access tokens
- Ensure strict Content Security Policy to mitigate XSS risk

#### H2: Development Mode User Email Header Injection

**Location:** `src/api/client.ts` (lines 44-47)

**Issue:** The `x-user-email` header is populated from `localStorage` for dev mode user simulation. This pattern could be accidentally left enabled in production or exploited if attackers can manipulate localStorage.

```typescript
const devUserEmail = localStorage.getItem('dev_user_email');
if (devUserEmail) {
  config.headers["x-user-email"] = devUserEmail;
}
```

**Risk:** User impersonation if backend trusts this header without proper environment gating.

**Recommendation:**
- Ensure backend validates this header is only processed in development environments
- Add explicit environment check in frontend before sending this header
- Consider removing this pattern entirely and using proper test authentication

#### H3: Sensitive Data in localStorage Without Expiration

**Location:** Multiple files using `usePersistedState.ts`, `ComplianceCenter.tsx`, `HRAISAssessment.tsx`, `ShadowAI.tsx`

**Issue:** Various governance data (HRAIS assessments, compliance progress, framework selections) are persisted to localStorage indefinitely:

- `ava_selected_frameworks`
- `ava_unified_program_progress`
- `ava_compliance_gap_actions`
- `hrais-selected-risks` / `hrais-profile`
- `ava_govern_shadow_ai_disposition`

**Risk:** Sensitive governance data persists even after logout and could be accessed by other users on shared machines or extracted via XSS.

**Recommendation:**
- Clear governance-specific localStorage keys on logout
- Add expiration timestamps to persisted data
- Consider using sessionStorage for non-persistent data
- Document which data is appropriate for localStorage persistence

---

### MEDIUM (Address in Future Sprint)

#### M1: Console Logging of Errors May Leak Information

**Location:** 14 files with console.log/error/warn statements

Key occurrences:
- `ConnectionWizard.tsx:168,185` - API error logging
- `useAgentRegistry.ts:317` - Agent registry load failures
- `useComplianceAttestations.ts:103,168,196,212` - Compliance API errors
- `useGovernanceAggregator.ts:413` - Governance data load failures
- `safety/RedTeamTestPipeline.tsx:584,589` - Debug logging with finding IDs

**Risk:** Error messages could leak internal API endpoints, stack traces, or sensitive data structures to browser console where they can be observed.

**Recommendation:**
- Replace console.error with structured error handling/logging service
- Remove debug console.log statements (lines 584, 589 in RedTeamTestPipeline)
- Ensure error messages shown to users are sanitized

#### M2: URL Parameters Used Without Sanitization

**Location:** `AgentRegistry.tsx`, `DevToolsGovernance.tsx`, `ModelManagement.tsx`, `MultiCloudGovernance.tsx`, `RiskManagement.tsx`

**Issue:** URL search parameters are read and used for tab/filter state without explicit sanitization:

```typescript
const tabFromUrl = searchParams.get('tab') as TabId | null;
const agentFromUrl = searchParams.get('agent');
const providerFromUrl = searchParams.get('provider') as AgentProvider | null;
```

**Risk:** While React's JSX escaping provides protection, unsanitized URL params used in logic could cause issues.

**Positive note:** The code does validate against allowed values:
```typescript
tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'agents'
```

**Recommendation:**
- Continue the pattern of validating URL params against allowed values
- Add TypeScript strict type guards for URL parameter parsing
- Document expected URL parameter formats

#### M3: Direct fetch() Calls Bypass Central Client

**Location:** `data/useDataLineage.ts`, `data/useDataQuality.ts`, `data/useDataReadiness.ts`, `evalData.ts`

**Issue:** Several data hooks use raw `fetch()` instead of the centralized axios client:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const res = await fetch(url);
```

**Risk:** These calls bypass the central authentication interceptor and error handling. If these endpoints require authentication, they won't receive the Bearer token.

**Recommendation:**
- Migrate to using the centralized client from `../../api/client.ts`
- Or explicitly add auth headers if fetch must be used
- Audit whether these endpoints actually require authentication

#### M4: External Image Sources

**Location:** `data/GraphRAG.tsx:139`, `PromptGovernance.tsx:635`

**Issue:** External images are loaded from AWS CDN:
```tsx
<img src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35@2x.png" .../>
```

**Risk:** 
- External asset loading could be blocked by strict CSP
- AWS CDN changes could affect display
- Privacy: third-party requests reveal user activity

**Recommendation:**
- Host critical images locally or in project assets
- Add `onError` handlers (already present in PromptGovernance.tsx - good pattern)
- Document expected CSP policy for external resources

#### M5: No Input Validation on Form Inputs

**Location:** 41 files with form inputs (onChange handlers)

**Issue:** While React provides XSS protection, there's no visible input validation for:
- Maximum length limits
- Character restrictions
- Format validation before API submission

**Examples:** Search filters, name inputs, description fields across the Govern module.

**Recommendation:**
- Add maxLength attributes to text inputs
- Implement validation before API calls
- Consider using a form validation library (react-hook-form, yup)

---

### LOW (Awareness / Best Practice)

#### L1: CSV Export Without Sanitization

**Location:** `ComplianceCenter.tsx:497-503`, `ModelOperations.tsx:24-25`

**Issue:** CSV export uses basic quote escaping but doesn't handle CSV injection:

```typescript
const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
```

**Risk:** CSV injection could execute formulas if opened in Excel (=, +, -, @, |, %).

**Recommendation:**
- Prefix potentially dangerous characters with single quote
- Document CSV security risks to users

#### L2: sessionStorage for Audit Events

**Location:** `auditLog.ts`

**Issue:** Audit event buffer uses sessionStorage, which is appropriate for session-scoped data. The code comment mentions security considerations (good).

**Positive:** Code comment at line 14 documents the security reasoning.

**Recommendation:** None - this is implemented correctly.

#### L3: No Test Coverage for Security Scenarios

**Location:** No `*.test.*` files found in govern directory

**Issue:** No unit or integration tests exist for the Govern module to verify security behaviors.

**Recommendation:**
- Add tests for authentication flow
- Test input sanitization
- Test error handling doesn't leak sensitive data

#### L4: File Download Pattern

**Location:** `exportUtils.ts`, `AuditIncidents.tsx`, `ComplianceCenter.tsx`, `FriaWizard.tsx`

**Issue:** File downloads use blob URL pattern which is standard but worth monitoring:

```typescript
const blob = new Blob([content], { type: mimeType });
const url = URL.createObjectURL(blob);
// ... download ...
URL.revokeObjectURL(url);
```

**Positive:** `URL.revokeObjectURL()` is properly called to clean up.

**Recommendation:** None - implemented correctly.

#### L5: External Links Without noopener/noreferrer

**Location:** Most external links DO use `rel="noopener noreferrer"` (good pattern observed)

**Positive:** External links consistently use proper rel attributes:
```tsx
<a href="..." target="_blank" rel="noopener noreferrer">
```

**Recommendation:** None - implemented correctly.

---

## API Client Security Review

### Strengths

1. **Centralized Authentication:** Bearer token is automatically added via request interceptor
2. **401 Handling:** Automatic token clearing and page reload on unauthorized responses
3. **Type Safety:** TypeScript interfaces for API requests/responses
4. **URL Encoding:** Proper use of `encodeURIComponent` for dynamic URL parameters

### Areas for Improvement

1. **No CSRF Protection:** No CSRF tokens observed (may be handled by backend)
2. **No Request/Response Logging Control:** Consider adding opt-in request logging for debugging
3. **No Retry Logic:** Failed requests aren't retried (may be intentional)

---

## OWASP Top 10 Assessment

| Risk | Status | Notes |
|------|--------|-------|
| A01:2021 - Broken Access Control | **PARTIAL** | Auth enforced but no visible RBAC in frontend |
| A02:2021 - Cryptographic Failures | **OK** | HTTPS assumed; tokens handled appropriately |
| A03:2021 - Injection | **OK** | No SQL/command injection vectors; React escapes output |
| A04:2021 - Insecure Design | **OK** | Proper separation of concerns |
| A05:2021 - Security Misconfiguration | **REVIEW** | CSP policy not visible in frontend |
| A06:2021 - Vulnerable Components | **UNKNOWN** | Package audit recommended |
| A07:2021 - Auth Failures | **PARTIAL** | Cognito integration solid; token storage could improve |
| A08:2021 - Data Integrity Failures | **OK** | API client validates responses |
| A09:2021 - Logging & Monitoring | **PARTIAL** | Console logging needs cleanup |
| A10:2021 - SSRF | **N/A** | Frontend doesn't make server-side requests |

---

## Recommendations Summary

### Immediate Actions
1. Audit and remove debug console.log statements
2. Add localStorage cleanup on logout for sensitive governance data
3. Evaluate token storage strategy (localStorage vs httpOnly cookies)

### Short-term Actions
1. Migrate direct fetch() calls to centralized client
2. Add input validation to form fields
3. Add security-focused unit tests

### Long-term Actions
1. Implement proper CSP headers (backend/infrastructure)
2. Add structured error logging service
3. Consider implementing RBAC display controls based on user roles

---

## Files Reviewed

- `src/api/client.ts` (full review)
- `src/auth/AuthContext.tsx` (full review)
- `src/App.tsx` (route protection review)
- 216 files in `src/components/govern/` (pattern-based review)

---

*This analysis focuses on client-side security. Backend API security, infrastructure security, and dependency vulnerabilities require separate assessments.*
