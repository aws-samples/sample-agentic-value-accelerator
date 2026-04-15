# Frontend Mock Mode

## Overview

The application uses mock payment API responses directly in the browser for the payment flow. No external payment API credentials or backend server are required.

## Quick Start

### 1. Configuration

In `web-ui/.env.local`:

```bash
VITE_PAYMENT_MOCK_MODE=true
```

This is the default setting.

### 2. Start the Application

```bash
# From project root
npm run dev
```

### 3. Test Payment Flow

1. Sign in or create a new user
2. Add items to cart using the shopping agent
3. Click **"Checkout"** or **"Add Payment Method"**
4. Fill in any test card details
5. Complete the flow (all steps are mocked in the browser)

## How It Works

The mock service (`web-ui/src/services/mockPaymentService.ts`) provides simulated responses for all payment operations:

- Card onboarding (enrollment + token provisioning)
- Device attestation and binding
- OTP step-up verification (accepts any code)
- Passkey registration
- Click to Pay card enrollment
- Purchase initiation
- Payment credentials retrieval

All mock operations include simulated network delays for realistic behavior and return predictable test data.

## Files

- **`web-ui/src/services/mockPaymentService.ts`** - Mock payment API service
- **`web-ui/src/components/CardAuth.tsx`** - Card onboarding component (uses mock service)
- **`web-ui/src/components/PurchaseConfirmation.tsx`** - Purchase flow component (uses mock service)
- **`web-ui/.env.local`** - Configuration with `VITE_PAYMENT_MOCK_MODE=true`
