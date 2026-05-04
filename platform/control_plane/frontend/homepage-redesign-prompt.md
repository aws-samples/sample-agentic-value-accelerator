## Task

Redesign the homepage at `/Users/vivibui/Desktop/projects/fsi-agent-kit/platform/control_plane/frontend/src/components/Home.tsx` to be executive-grade and visually compelling.

## Critical Constraints
1. NO EMOJIS anywhere
2. Must compile with `npx tsc --noEmit` and build with `npm run build`
3. Keep the ombre gradient background (same as other pages)
4. Working directory: `/Users/vivibui/Desktop/projects/fsi-agent-kit/platform/control_plane/frontend`
5. Use React + Tailwind CSS (no external dependencies)
6. The page should fit comfortably in one window view

## Current Problem
The current homepage has the right content structure (Strategy / Platform / Application pillars) but the SVG illustrations look amateurish and the overall design isn't executive-compelling. It needs to look polished, clean, and professional — like a premium SaaS dashboard landing page.

## Content Structure (KEEP THIS — it's correct)

**Hero:** "Agentic Value Accelerator" + subtitle + two CTA buttons (Explore the Platform, Quick Start Guide)

**Three Pillars:**

1. **Strategy** (indigo)
   - Use Case Discovery: 8-step framework to identify and prioritize agentic AI opportunities

2. **Platform** (emerald/green)
   - Deployment Pipeline: Deploy e2e solutions with full build visibility, direct frontend access, and built-in testing (CLI, scripts, custom payloads)
   - Observability: Agent Safety guardrails and Langfuse tracing

3. **Application** (blue)
   - FSI Foundry (34 use cases): Multi-agent applications across 6 FSI domains
   - Reference Apps: End-to-end full-stack solutions
   - Templates: Scaffold custom agents with IaC
   - App Factory (Coming Soon): Describe use case, generate blueprint

## Design Direction

Think Stripe, Linear, or Vercel dashboards — clean, minimal, premium. Specifically:

1. **Remove the amateur SVG illustrations** — they look bad. Instead, use subtle visual differentiation through:
   - Color-coded left borders or top gradient bars
   - Clean iconography (Heroicons outline style, already used elsewhere)
   - Subtle background gradients per card on hover
   - Badge/tag treatments for counts and statuses

2. **Visual hierarchy through card sizing** — FSI Foundry should be the largest/most prominent card in the Application section since it's the main product

3. **Clean typography** — Let the text breathe. Good spacing, clear headings, concise descriptions

4. **Subtle animations** — fade-in on load, hover lift effects on cards (already using `animate-fade-in` classes)

5. **Professional color palette** — Keep the existing color assignments (indigo for Strategy, emerald for Platform, blue for Application) but use them sparingly and elegantly

6. **One-window fit** — Everything visible without scrolling on a standard laptop (1440x900 viewport)

## Routes for onClick navigation
- `/accelerator-guide` — Use Case Discovery
- `/deployments` — Deployment Pipeline  
- `/observability` — Observability
- `/applications/fsi-foundry` — FSI Foundry
- `/applications/reference-implementations` — Reference Apps
- `/applications/templates` — Templates
- `/applications/app-factory` — App Factory

## Footer
Keep the "Made with heart by FSI PACE Prototyping Team" footer with the heartbeat animation.

## Implementation
- Read the current Home.tsx first
- Rewrite it completely with the improved design
- Test: `npx tsc --noEmit && npm run build`
- Commit with message: "feat: executive-grade homepage redesign"
