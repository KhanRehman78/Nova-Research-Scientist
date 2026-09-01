\# Design System Master File

\> \*\*LOGIC:\*\* When building a specific page, first check \`design-system/pages/\[page-name\].md\`.  
\> If that file exists, its rules \*\*override\*\* this Master file.  
\> If not, strictly follow the rules below.

\---

\*\*Project:\*\* NOVA — Autonomous Intelligence Research Engine  
\*\*Generated:\*\* 2026-09-01 11:37:15  
\*\*Category:\*\* AI Research Platform (multi-agent research console)

\> \*\*Deviation note:\*\* The generator mis-categorized this as a music app and returned a light  
\> palette. Per the authoritative User Preferences (dark research console), the palette below  
\> has been overridden to a dark near-black navy scheme with electric-cyan \+ violet neon  
\> accents. The token block in \`src/index.css\` is the rendering source of truth.

\---

\#\# Global Rules

\#\#\# Color Palette

| Role | Hex | CSS Variable |  
|------|-----|--------------|  
| Primary | \`\#22D3EE\` | \`--color-primary\` |  
| On Primary | \`\#04121A\` | \`--color-on-primary\` |  
| Secondary | \`\#A78BFA\` | \`--color-secondary\` |  
| Accent/CTA | \`\#5EEAD4\` | \`--color-accent\` |  
| Background | \`\#070B14\` | \`--color-background\` |  
| Foreground | \`\#E7ECF7\` | \`--color-foreground\` |  
| Muted | \`\#131A2B\` | \`--color-muted\` |  
| Border | \`\#233049\` | \`--color-border\` |  
| Destructive | \`\#F87171\` | \`--color-destructive\` |  
| Ring | \`\#22D3EE\` | \`--color-ring\` |

\*\*Color Notes:\*\* Electric cyan \+ soft violet neon on a near-black deep-navy base. Success \`\#34D399\`, warning \`\#FBBF24\`. Text on dark background keeps ≥4.5:1 contrast.

\#\#\# Typography

\- \*\*Heading Font:\*\* Crimson Pro  
\- \*\*Body Font:\*\* Atkinson Hyperlegible  
\- \*\*Mood:\*\* academic, research, scholarly, accessible, readable, educational  
\- \*\*Google Fonts:\*\* \[Crimson Pro \+ Atkinson Hyperlegible\](https://fonts.google.com/share?selection.family=Atkinson+Hyperlegible:wght@400;700|Crimson+Pro:wght@400;500;600;700)

\*\*CSS Import:\*\*  
\`\`\`css  
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700\&family=Crimson+Pro:wght@400;500;600;700\&display=swap');  
\`\`\`

\#\#\# Spacing Variables

| Token | Value | Usage |  
|-------|-------|-------|  
| \`--space-xs\` | \`4px\` / \`0.25rem\` | Tight gaps |  
| \`--space-sm\` | \`8px\` / \`0.5rem\` | Icon gaps, inline spacing |  
| \`--space-md\` | \`16px\` / \`1rem\` | Standard padding |  
| \`--space-lg\` | \`24px\` / \`1.5rem\` | Section padding |  
| \`--space-xl\` | \`32px\` / \`2rem\` | Large gaps |  
| \`--space-2xl\` | \`48px\` / \`3rem\` | Section margins |  
| \`--space-3xl\` | \`64px\` / \`4rem\` | Hero padding |

\#\#\# Shadow Depths

| Level | Value | Usage |  
|-------|-------|-------|  
| \`--shadow-sm\` | \`0 1px 2px rgba(0,0,0,0.05)\` | Subtle lift |  
| \`--shadow-md\` | \`0 4px 6px rgba(0,0,0,0.1)\` | Cards, buttons |  
| \`--shadow-lg\` | \`0 10px 15px rgba(0,0,0,0.1)\` | Modals, dropdowns |  
| \`--shadow-xl\` | \`0 20px 25px rgba(0,0,0,0.15)\` | Hero images, featured cards |

\---

\#\# Component Specs

\#\#\# Buttons

\`\`\`css  
/\* Primary Button \*/  
.btn-primary {  
  background: \#D97706;  
  color: white;  
  padding: 12px 24px;  
  border-radius: 8px;  
  font-weight: 600;  
  transition: all 200ms ease;  
  cursor: pointer;  
}

.btn-primary:hover {  
  opacity: 0.9;  
  transform: translateY(-1px);  
}

/\* Secondary Button \*/  
.btn-secondary {  
  background: transparent;  
  color: \#1E40AF;  
  border: 2px solid \#1E40AF;  
  padding: 12px 24px;  
  border-radius: 8px;  
  font-weight: 600;  
  transition: all 200ms ease;  
  cursor: pointer;  
}  
\`\`\`

\#\#\# Cards

\`\`\`css  
.card {  
  background: \#F8FAFC;  
  border-radius: 12px;  
  padding: 24px;  
  box-shadow: var(--shadow-md);  
  transition: all 200ms ease;  
  cursor: pointer;  
}

.card:hover {  
  box-shadow: var(--shadow-lg);  
  transform: translateY(-2px);  
}  
\`\`\`

\#\#\# Inputs

\`\`\`css  
.input {  
  padding: 12px 16px;  
  border: 1px solid \#E2E8F0;  
  border-radius: 8px;  
  font-size: 16px;  
  transition: border-color 200ms ease;  
}

.input:focus {  
  border-color: \#1E40AF;  
  outline: none;  
  box-shadow: 0 0 0 3px \#1E40AF20;  
}  
\`\`\`

\#\#\# Modals

\`\`\`css  
.modal-overlay {  
  background: rgba(0, 0, 0, 0.5);  
  backdrop-filter: blur(4px);  
}

.modal {  
  background: white;  
  border-radius: 16px;  
  padding: 32px;  
  box-shadow: var(--shadow-xl);  
  max-width: 500px;  
  width: 90%;  
}  
\`\`\`

\---

\#\# Style Guidelines

\*\*Style:\*\* Dark Mode (OLED)

\*\*Keywords:\*\* Dark theme, low light, high contrast, deep black, midnight blue, eye-friendly, OLED, night mode, power efficient

\*\*Best For:\*\* Night-mode apps, coding platforms, entertainment, eye-strain prevention, OLED devices, low-light

\*\*Key Effects:\*\* Minimal glow (text-shadow: 0 0 10px), dark-to-light transitions, low white emission, high readability, visible focus

\#\#\# Page Pattern

\*\*Pattern Name:\*\* Video-First Hero

\- \*\*Conversion Strategy:\*\* 86% higher engagement with video. Add captions for accessibility. Compress video for performance.  
\- \*\*CTA Placement:\*\* Overlay on video (center/bottom) \+ Bottom section  
\- \*\*Section Order:\*\* 1\. Hero with video background, 2\. Key features overlay, 3\. Benefits section, 4\. CTA

\---

\#\# Anti-Patterns (Do NOT Use)

\- ❌ Pure white backgrounds

\#\#\# Additional Forbidden Patterns

\- ❌ \*\*Emojis as icons\*\* — Use SVG icons (Heroicons, Lucide, Simple Icons)  
\- ❌ \*\*Brand/social icons from \`lucide-react\`\*\* — \`lucide-react\` no longer ships brand/social logos (GitHub, X/Twitter, LinkedIn, Facebook, Instagram, YouTube, Discord, etc.) and importing them breaks the build. Use \`react-icons/si\` (Simple Icons) for brand logos; keep Lucide/Phosphor for generic UI icons  
\- ❌ \*\*Missing cursor:pointer\*\* — All clickable elements must have cursor:pointer  
\- ❌ \*\*Layout-shifting hovers\*\* — Avoid scale transforms that shift layout  
\- ❌ \*\*Low contrast text\*\* — Maintain 4.5:1 minimum contrast ratio  
\- ❌ \*\*Instant state changes\*\* — Always use transitions (150-300ms)  
\- ❌ \*\*Invisible focus states\*\* — Focus states must be visible for a11y

\---

\#\# Domain Guidelines — Dashboard & Data UI

\#\#\# Information Hierarchy  
\- Lead with the 3 most critical metrics — stat cards at top, large numbers, trend indicators (↑ ↓ % change).  
\- Use progressive disclosure: summary → detail on click/expand. Never show everything at once.  
\- Group related metrics spatially: financial together, engagement together, ops together.  
\- Color signals status, not decoration: green \= healthy, amber \= warning, red \= critical. Be consistent.

\#\#\# Data Tables  
\- Sort every column on header click — toggle asc/desc with a visible arrow indicator.  
\- Always show row count and pagination: "Showing 1–25 of 312 results".  
\- Freeze the header row on scroll for any table taller than the viewport.  
\- Zebra striping (alternating row backgrounds) improves readability in dense tables.  
\- Right-align numbers; left-align text — this is the universal data table convention.

\#\#\# Empty & Loading States  
\- Every table, chart, and card needs an explicit empty state — never a blank space.  
\- Use skeleton loading (animated gray rectangles) for content that takes \> 300ms, not spinners.  
\- Show "Last updated X ago" on live data cards so users know freshness.

\#\#\# Filters & Controls  
\- Filters go above the data they affect — never below.  
\- Applied filters must be visible as removable chips/tags at all times.  
\- "Clear all" must be one click.  
\- Date range pickers: always show the selected range as readable text beside the calendar.  
\- \*\*Anti-patterns:\*\* charts without axis labels, percentages without context (% of what?), missing tooltips on chart hover, no loading state.

\---

\#\# Pre-Delivery Checklist

Before delivering any UI code, verify:

\- \[ \] No emojis used as icons (use SVG instead)  
\- \[ \] UI icons from a consistent set (Heroicons/Lucide/Phosphor); brand/social logos from \`react-icons/si\` (never \`lucide-react\`)  
\- \[ \] \`cursor-pointer\` on all clickable elements  
\- \[ \] Hover states with smooth transitions (150-300ms)  
\- \[ \] Light mode: text contrast 4.5:1 minimum  
\- \[ \] Focus states visible for keyboard navigation  
\- \[ \] \`prefers-reduced-motion\` respected  
\- \[ \] Responsive: 375px, 768px, 1024px, 1440px  
\- \[ \] No content hidden behind fixed navbars  
\- \[ \] No horizontal scroll on mobile

\---

\#\# User Preferences (authoritative)

These override any conflicting default above:

\- Dark research-console aesthetic: near-black deep-navy space background, electric cyan and violet neon accents, glassy translucent panels, subtle dot-grid background, monospace accents for data/labels, professional and legible (not gamer-y), futuristic but restrained, visible streaming progress at every step.

\---

\#\# Tailwind v4 Tokens (applied to \`src/index.css\`)

These tokens are the rendering source of truth and are written into \`src/index.css\` for you. Build with them (\`bg-primary\`, \`text-foreground\`, \`font-heading\`, …); don't move or duplicate the \`@import\`/\`@theme\`.

\`\`\`css  
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700\&family=Crimson+Pro:wght@400;500;600;700\&family=JetBrains+Mono:wght@400;500;600\&display=swap');

@theme {  
  \--font-sans: "Atkinson Hyperlegible", ui-sans-serif, system-ui, \-apple-system, sans-serif;  
  \--font-heading: "Crimson Pro", ui-sans-serif, system-ui, \-apple-system, sans-serif;  
  \--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;  
  \--color-primary: \#22d3ee;  
  \--color-on-primary: \#04121a;  
  \--color-secondary: \#a78bfa;  
  \--color-accent: \#5eead4;  
  \--color-background: \#070b14;  
  \--color-foreground: \#e7ecf7;  
  \--color-muted: \#131a2b;  
  \--color-border: \#233049;  
  \--color-destructive: \#f87171;  
  \--color-ring: \#22d3ee;  
  \--color-panel: \#0b1120;  
  \--color-panel-2: \#101a30;  
  \--color-success: \#34d399;  
  \--color-warning: \#fbbf24;  
}  
\`\`\`

