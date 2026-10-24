# PHS CDP UI SYSTEM

## Project

Build a high-quality frontend-only Customer Data Platform (CDP)
prototype for Phu Hung Securities (PHS).

This is an enterprise financial-services CDP prototype.

The application is intended for:
- internal product discussions
- PoC demonstrations
- stakeholder presentations
- future backend integration

---

# CORE OBJECTIVE

Create a realistic enterprise CDP application.

This must NOT look like:
- a landing page
- a marketing website
- a generic SaaS template
- an AI-generated dashboard template

It must look like a real enterprise data platform.

---

# BRAND

Company:
Phu Hung Securities

Short name:
PHS

Product:
PHS Customer Data Platform

Product abbreviation:
PHS CDP

Use the official PHS logo provided in the project assets.

Do NOT create a fake logo.

Do NOT redraw or modify the PHS logo.

---

# VISUAL DIRECTION

Primary direction:

Premium Financial Intelligence Platform.

Personality:

- professional
- sophisticated
- trustworthy
- intelligent
- data-driven
- enterprise-grade
- modern
- financial-services oriented

The product should feel appropriate for a securities company.

---

# VISUAL PRINCIPLES

Avoid:

- excessive blue
- monochromatic UI
- excessive cards
- excessive gradients
- giant rounded cards
- emoji icons
- generic dashboard layouts
- excessive shadows
- excessive whitespace
- landing-page aesthetics
- identical layouts across every page

The UI should have strong visual hierarchy.

Use:

- typography
- spacing
- borders
- semantic colors
- charts
- tables
- timelines
- split layouts
- tabs
- drawers
- contextual panels

Cards should be used selectively.

Not every section should be a card.

---

# ICONOGRAPHY

Use Lucide Icons.

Do not use:
- emoji
- random Unicode symbols
- mixed icon libraries

Icons should be semantic and consistent.

Examples:

Dashboard → LayoutDashboard
Customers → Users
Customer 360 → UserRound
Audiences → UsersRound
Events → Activity
Identity → Network
Journeys → Workflow
Activation → Send
Data → Database
Consent → ShieldCheck
Settings → Settings

---

# MODULE VISUAL PERSONALITY

Each major module should feel different while remaining
part of the same design system.

Dashboard:
Analytics-oriented.

Customer 360:
Customer intelligence-oriented.

Audiences:
Segmentation-oriented.

Segment Builder:
Builder-oriented.

Events:
Data exploration-oriented.

Identity Graph:
Graph-oriented.

Journeys:
Workflow-oriented.

Activation:
Execution-oriented.

Data:
Infrastructure-oriented.

Consent:
Privacy-oriented.

---

# INFORMATION ARCHITECTURE

## Dashboard

- Overview
- Customer metrics
- Growth
- Engagement
- Event activity
- Audience performance

## Customers

- All Profiles
- Customer 360
- Identity Graph

## Audiences

- All Audiences
- Segment Builder
- Audience Insights

## Events

- Event Explorer
- Event Definitions
- Event Stream

## Journeys

- All Journeys
- Journey Builder

## Activation

- Destinations
- Campaigns

## Data

- Data Sources
- Schemas
- Pipelines
- Data Quality

## Consent

- Consent Overview
- Preferences
- Consent History

## Settings

- Workspace
- Users
- Roles
- API Keys
- Integrations

---

# CUSTOMER 360

Customer profiles should include:

Identity:
- CRM ID
- Customer ID
- Email
- Phone
- Device ID
- AppsFlyer ID
- Trading Account ID

Attributes:
- Name
- Age
- Gender
- Location
- Customer Tier
- Lifecycle Stage
- Registration Date

Behavior:
- App Opens
- Logins
- Stock Views
- Searches
- Watchlist
- Trading activity

Transactions:
- Buy
- Sell
- Deposit
- Withdrawal

Engagement:
- Email
- Push
- Campaigns

Consent:
- Marketing
- Analytics
- Personalization

Audiences:
- Active Investor
- New User
- High Value Customer
- Dormant Customer
- High Engagement

---

# SEGMENT BUILDER

Support conditions such as:

Age
Gender
Location
Customer Tier
Lifecycle Stage
Last Login
Last App Open
Trading Activity
Deposit Amount
Total Transaction Value
Marketing Consent

Support:

AND
OR
Nested condition groups
Add condition
Remove condition
Duplicate condition

Show:

Estimated audience size
Audience growth
Preview profiles

---

# EVENTS

Examples:

App Open
Login
View Stock
Search Stock
Watchlist Add
Deposit
Withdrawal
Place Order
Buy
Sell
Push Open
Email Open

Event detail should support properties such as:

symbol
side
quantity
price
channel
device
campaign
source

---

# IDENTITY GRAPH

Show relationships between:

CRM ID
Customer ID
Email
Phone
Device ID
AppsFlyer ID
Trading Account ID

Show:

- identity confidence
- source
- last seen
- relationship
- merge status

---

# JOURNEY BUILDER

Support visual nodes:

Trigger
Audience
Wait
Condition
Action
Goal

Example:

Audience
↓
App Login
↓
Wait 1 Day
↓
Push Notification
↓
Condition
↓
Deposit
↓
Success

---

# DATA SOURCES

Examples:

CRM
Mobile App
Trading System
Website
AppsFlyer
GA4
n8n

Status:

Connected
Warning
Disconnected

---

# ACTIVATION DESTINATIONS

Examples:

Email
Push
SMS
Webhook
Meta Ads
Google Ads

---

# CONSENT

Support:

Marketing Consent
Analytics Consent
Personalization Consent

Include:

- current status
- source
- timestamp
- consent history
- preference changes

---

# MOCK DATA

Use realistic Vietnamese financial-services customer data.

Do NOT use:

John Doe
Jane Doe
Test User
User 1
User 2

Use realistic examples such as:

Nguyễn Minh Anh
Trần Quốc Bảo
Lê Hoàng Nam
Phạm Thu Hà

Use realistic:

- customer IDs
- trading accounts
- transactions
- event timestamps
- portfolio values
- audience memberships

All data is fictional mock data.

Never use real customer data.

---

# RESPONSIVENESS

Desktop-first.

Primary target:
1440px

Also support:

1280px
1024px
mobile fallback

---

# COMPONENT PRINCIPLES

Build reusable components.

Examples:

Sidebar
Topbar
PageHeader
Metric
Table
Tabs
Badge
Dropdown
Modal
Drawer
Timeline
Chart
CustomerProfile
IdentityNode
SegmentCondition
JourneyNode

Do not duplicate components between pages.

---

# CODE PRINCIPLES

Keep:

HTML
CSS
JavaScript
mock data

separated logically.

Avoid unnecessary frameworks.

Prefer simple maintainable frontend architecture.

Do not create duplicated CSS.

Do not create page-specific versions of global components.

---

# IMPORTANT

Before implementing a page:

1. Check the existing design system.
2. Reuse existing components.
3. Follow the PHS visual direction.
4. Keep module-specific visual personality.
5. Avoid generic AI-generated UI patterns.

When modifying the UI globally,
modify the shared component rather than patching individual pages.

---

# FUTURE BACKEND

The current application is frontend-only.

However, structure the code so mock data can later be replaced by APIs.

Future integrations may include:

- n8n
- CRM
- AppsFlyer
- GA4
- trading systems
- customer databases
- consent systems

Do not implement real integrations now.

---

# QUALITY BAR

The final UI should look like a serious enterprise CDP product.

It should be suitable for:
- Head-level review
- CEO demonstration
- PoC presentation
- product discussion

Do not stop at a functional prototype.

Perform a visual polish pass after functionality is complete.
