# Market Surveillance Portal

A modern Next.js web application for investigating trade alerts with a professional design language.

## Features

- **Landing Page**: Card-based dashboard with statistics and alert list
- **Alert Detail Page**: Clean, organized view of alert information with visual hierarchy
- **Investigation Page**: Timeline-based audit trail showing AI agent investigation steps
- **Professional Design**: Clean, modern UI with a cohesive color palette

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Custom color palette (Squid Ink #232F3E, Sea Blue #005276, Aqua #007FAA, Lab #38EF7D, Mist #9FFCEA)

## Getting Started

1. Navigate to the project directory:
```bash
cd trade-alerts-app
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
trade-alerts-app/
├── app/
│   ├── alerts/
│   │   └── [id]/
│   │       ├── page.tsx              # Alert detail page
│   │       └── investigation/
│   │           └── page.tsx          # Investigation audit trail page
│   ├── layout.tsx                    # Root layout with header
│   ├── page.tsx                      # Landing page (alerts list)
│   └── globals.css                   # Global styles with theme colors
├── components/
│   └── Header.tsx                    # Navigation header
├── lib/
│   └── mockData.ts                   # Mock alert and investigation data
└── types/
    └── alert.ts                      # TypeScript interfaces

```

## Mock Data

The application includes 6 sample alerts with different statuses:
- Pending
- Investigating (with audit trail)
- Resolved

Two alerts (#124 and #127) have investigation audit trails showing AI agent actions.

## Design Features

- **Custom Logo**: SVG logo using the platform color palette
- **Card-Based Layout**: Clean white cards with subtle shadows
- **Modern Typography**: Clear hierarchy with proper spacing
- **Status Badges**: Color-coded rounded badges for alert status
- **Responsive Design**: Works on all screen sizes
- **Smooth Transitions**: Hover effects and animations
- **Professional Color Scheme**: Squid Ink (#232F3E), Sea Blue (#005276), Aqua (#007FAA)

## Pages

### 1. Landing Page (`/`)
- Statistics dashboard showing total alerts, pending, and investigating counts
- Card-based alert list with expandable information
- Each card shows: Alert ID, status, summary, account, date/time, ISIN, and trade details
- Hover effects for better interactivity

### 2. Alert Detail Page (`/alerts/[id]`)
- Clean header with alert ID and status badge
- Icon-based information sections
- Trade details with visual indicators
- Large action button to start or view investigation

### 3. Investigation Page (`/alerts/[id]/investigation`)
- Timeline-based audit trail with numbered steps
- Gradient badges connecting investigation steps
- Each step shows: action, timestamp, findings, and agent
- In-progress indicator with animated spinner
- Empty state for alerts without investigations

## Customization

To modify the branding colors, edit `app/globals.css`:
```css
:root {
  --msp-aqua: #007FAA;
  --msp-squid-ink: #232F3E;
  --msp-sea-blue: #005276;
  --msp-lab: #38EF7D;
  --msp-mist: #9FFCEA;
  --msp-gray: #F5F5F5;
}
```

## Next Steps (Backend Integration)

When ready to integrate with a backend:
1. Replace mock data in `lib/mockData.ts` with API calls
2. Add loading states and error handling
3. Implement real-time updates for investigation progress
4. Add authentication and authorization
