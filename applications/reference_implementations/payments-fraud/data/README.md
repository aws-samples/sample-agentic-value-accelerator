# Sample Data

Synthetic, fully fabricated payments data bundled with this reference implementation
(no real PII). Per AVA reference-app convention, the test data ships inside the app
so it is runnable and demoable out of the box.

The fraud scenarios, account ids, and expected fraud scores deliberately mirror the
`case-management` reference implementation so the two apps tell the same story — the
difference is the **agent-native architecture**, not the data.

## Layout

```
data/
├── accounts/<ACCOUNT_ID>/profile.json   # one profile per account, with embedded transactions
└── transactions.json                    # flat list of all transactions (derived from profiles)
```

`accounts/*/profile.json` is what the `get_account_profile` agent tool reads
(S3 key `${DATA_PREFIX}/<account_id>/profile.json`). `transactions.json` is the flat
seed for the transactions store that `get_transactions` queries.

Every transaction validates against the `Transaction` contract in
`src/strands/contracts.py`; every `expected_assessment` uses real `ScoringDecision`,
`RiskLevel`, and `FraudPattern` enum values.

## Scenarios

| Account | Customer | Scenario | Txns | Expected score | Decision | Tags |
|---------|----------|----------|:----:|:--------------:|----------|------|
| **A705** | Marcus Webb | Smurfing — 5 deposits just under $10k CTR threshold to one dest (A901) | 5 | 0.88 | step_up_review | `SMURFING` |
| **A305** | Dana Ortiz | High velocity — 8 instant payments to 3 dests in 32 min | 8 | 0.90 | step_up_review | `HIGH_VELOCITY` |
| **A801** | Quik Cash Services | Mule fan-in — new account collecting from A101–A105 | 5 | 0.96 | hold_and_case | `FAN_IN_TO_DST`, `MULE_DESTINATION` |
| **A201** | Helena Brandt | Large amount — single $48k wire to first-time beneficiary | 1 | 0.87 | step_up_review | `LARGE_AMOUNT`, `NEW_BENEFICIARY` |
| **A150** | Tom Becker | Clean — everyday spending (control) | 3 | 0.08 | approve | — |
| **A160** | Priya Nair | Clean — payroll + fuel (control) | 2 | 0.05 | approve | — |

`expected_assessment` in each profile is the **ground truth** for that account — useful
for demos, regression checks, and validating agent output. The agents are not given
these answers; they derive their own from the transaction data.

## Timestamps

The fixtures use **fixed** timestamps so the repo is deterministic. They are
*illustrative dates* — the fraud logic depends on the **relative** spacing between
transactions (e.g. the five smurfing transfers within a 48-hour window, A305's
8 transfers within ~30 minutes), not the absolute dates.

The seed script ([`../scripts/seed_data.py`](../scripts/seed_data.py)) shifts each
account's timestamps forward at upload time so the latest transaction lands a few
hours before "now" — keeping the demo fresh while preserving all relative spacing.
Run it with `--dry-run` to preview the shifted dates.

## Regenerating

`transactions.json` is derived from `accounts/*/profile.json`. If you edit a profile,
regenerate the flat seed so the two never drift (concatenate each profile's
`transactions` with its `expected_*` fields and sort by timestamp).

## Demo prompts

These match the scenarios above (and the case-management demo script):

- *"Score this transaction"* with `A801`'s `TXN_MULE_1` → expect `hold_and_case`.
- *"Investigate account A705. What suspicious activity do you see?"* → smurfing.
- *"Analyze account A305 — is there unusual behavior?"* → velocity (8 txns / 32 min).
- *"What's happening with account A801? Show incoming transactions."* → mule fan-in.
- *"Draft a SAR for the A801 case."* → FinCEN-structured draft (needs human review).
