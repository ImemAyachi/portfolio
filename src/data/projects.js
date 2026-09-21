/**
 * Project metadata and case-study copy.
 *
 * ⚠️ PLACEHOLDER PROSE. The names, taglines and stacks came from the design;
 * everything below them (`summary`, `problem`, `build`, `outcome`, `links`)
 * is scaffolding written to give the layout shape. It deliberately contains
 * no figures, dates or claims — replace it with what actually happened
 * before publishing.
 */
export const PROJECTS = [
  {
    id: 'menute',
    name: 'Menute',
    tagline: 'Smart menu & orders management platform.',
    role: 'Fullstack',
    stack: ['React', 'Node.js', 'PostgreSQL', 'Chart.js'],
    links: [
      { label: 'Live site', href: '#' },
      { label: 'Source', href: '#' },
    ],
    summary:
      'A management platform for restaurants: menus, orders and staff in one place, with the day’s numbers visible without exporting anything.',
    problem:
      'Small restaurants tend to run on a mix of paper, spreadsheets and whatever the delivery apps provide. Nobody has one view of what is selling, what is running out, or who is on shift — so decisions get made on instinct.',
    build: [
      'Menu and category management, with items priced and toggled without a developer involved.',
      'Order pipeline with live status, so the floor and the kitchen see the same thing.',
      'Role-based accounts separating owners, managers and staff.',
      'An analytics view covering revenue, order volume and top-selling items.',
    ],
    outcome:
      'Built end-to-end — data model, API and interface. Describe here what shipped and what you would change with hindsight.',
  },
  {
    id: 'ecomeasy',
    name: 'Ecomeasy',
    tagline: 'The all-in-one platform to launch and grow your online store.',
    role: 'Fullstack',
    stack: ['Next.js', 'Node.js', 'MongoDB', 'TailwindCSS', 'Stripe'],
    links: [
      { label: 'Live site', href: '#' },
      { label: 'Source', href: '#' },
    ],
    summary:
      'A storefront builder aimed at people who want to sell online without hiring anyone to set it up.',
    problem:
      'Getting a store online usually means stitching together a site builder, a payment provider and an inventory tool, then keeping all three in sync. That is a lot of moving parts for someone whose actual job is the product they sell.',
    build: [
      'Product and inventory management with variants and stock tracking.',
      'A themeable storefront that merchants configure without touching code.',
      'Checkout wired to Stripe, including payment states and receipts.',
      'An order dashboard covering fulfilment and customer history.',
    ],
    outcome:
      'The interesting problem was configuration: how much to expose before it stops feeling simple. Write up where you landed on that.',
  },
  {
    id: 'skillset-api',
    name: 'SkillSet API',
    tagline: 'RESTful backend powering the SkillSet platform.',
    role: 'Backend',
    stack: ['Node.js', 'Express', 'MongoDB', 'JWT'],
    links: [
      { label: 'API docs', href: '#' },
      { label: 'Source', href: '#' },
    ],
    summary:
      'The service layer behind SkillSet: accounts, listings, applications and the messaging that connects students to companies.',
    problem:
      'Two very different users — students and companies — need the same data shaped differently, and an application moves through several states that both sides have to trust.',
    build: [
      'Authentication and authorisation with refresh tokens and per-role access.',
      'A data model covering profiles, internship listings and applications.',
      'Application state machine, so status changes are explicit rather than implied.',
      'Realtime notifications over Socket.IO for status changes and messages.',
    ],
    outcome:
      'Most of the work was in the data model rather than the endpoints. Note here what you would model differently next time.',
  },
  {
    id: 'skillset-mobile',
    name: 'SkillSet Mobile',
    tagline: 'Cross-platform app for students to find and apply to internships.',
    role: 'Mobile',
    stack: ['React Native', 'Expo', 'Socket.IO'],
    links: [
      { label: 'App Store', href: '#' },
      { label: 'Source', href: '#' },
    ],
    summary:
      'The student-facing client: search listings, apply, and track where every application stands.',
    problem:
      'Students apply to a lot of places and then lose track of them. The information they need is not the listing — it is the state of the thing they already sent.',
    build: [
      'Search and filtering across listings by role, location and type.',
      'Apply flow with saved profile details, so applying twice is not twice the work.',
      'An application tracker grouping everything by status.',
      'Push and in-app notifications when a status changes.',
    ],
    outcome:
      'Shipped to both platforms from one codebase. Describe what that cost you and where it paid off.',
  },
]

export const PROJECTS_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p]))
