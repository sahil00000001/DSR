/**
 * Demo content for the seed.
 *
 * Split from `seed.ts` so the generation logic stays readable. The writing here is
 * deliberately specific — "Shipped the invoice export endpoint" rather than
 * "Worked on tasks" — because a demo with generic filler reads as a mock-up,
 * while one with plausible detail reads as a product in use.
 */

export interface SeedPerson {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  designation: string;
  department: string;
  team: string;
  location: string;
  /** Email of this person's manager. Resolved after all users exist. */
  managerEmail: string | null;
  phone: string;
  /** Months ago they joined. */
  joinedMonthsAgo: number;
  /** MM-DD */
  birthday: string;
  bio?: string;
}

export const LOCATIONS = [
  { name: "Bengaluru HQ", code: "BLR", city: "Bengaluru", country: "India", timezone: "Asia/Kolkata" },
  { name: "Pune Studio", code: "PNQ", city: "Pune", country: "India", timezone: "Asia/Kolkata" },
  { name: "Remote — India", code: "RMT", city: "Distributed", country: "India", timezone: "Asia/Kolkata" },
  { name: "Dubai Office", code: "DXB", city: "Dubai", country: "UAE", timezone: "Asia/Dubai" },
] as const;

export const DEPARTMENTS = [
  {
    name: "Engineering",
    color: "indigo",
    description: "Builds and operates the product and its platform.",
    teams: ["Platform", "Product Engineering", "Quality"],
  },
  {
    name: "Design",
    color: "violet",
    description: "Product design, research and the design system.",
    teams: ["Product Design"],
  },
  {
    name: "Customer Success",
    color: "emerald",
    description: "Onboarding, support and account health.",
    teams: ["Support", "Onboarding"],
  },
  {
    name: "Sales",
    color: "amber",
    description: "New business and partnerships.",
    teams: ["Inbound", "Enterprise"],
  },
  {
    name: "Marketing",
    color: "teal",
    description: "Positioning, content and demand generation.",
    teams: ["Content"],
  },
  {
    name: "People & Operations",
    color: "orange",
    description: "Hiring, HR operations and internal tooling.",
    teams: ["People Ops"],
  },
] as const;

/**
 * Twenty people with a realistic reporting structure: three managers reporting to
 * the admin, and the rest distributed beneath them.
 */
export const PEOPLE: SeedPerson[] = [
  {
    name: "Aisha Khan",
    email: "aisha.khan@cadence.dev",
    role: "ADMIN",
    designation: "Head of Operations",
    department: "People & Operations",
    team: "People Ops",
    location: "Bengaluru HQ",
    managerEmail: null,
    phone: "+91 98450 11201",
    joinedMonthsAgo: 41,
    birthday: "03-14",
    bio: "Runs operations and this portal. Ask me about process, tooling or anything HR.",
  },
  {
    name: "Rohan Mehta",
    email: "rohan.mehta@cadence.dev",
    role: "MANAGER",
    designation: "Engineering Manager",
    department: "Engineering",
    team: "Platform",
    location: "Bengaluru HQ",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98450 11202",
    joinedMonthsAgo: 34,
    birthday: "07-02",
    bio: "Platform and infrastructure. Currently focused on the multi-region migration.",
  },
  {
    name: "Neha Iyer",
    email: "neha.iyer@cadence.dev",
    role: "MANAGER",
    designation: "Design Lead",
    department: "Design",
    team: "Product Design",
    location: "Pune Studio",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98220 11203",
    joinedMonthsAgo: 28,
    birthday: "11-23",
    bio: "Design systems and research. I keep the component library honest.",
  },
  {
    name: "Vikram Rao",
    email: "vikram.rao@cadence.dev",
    role: "MANAGER",
    designation: "Customer Success Manager",
    department: "Customer Success",
    team: "Onboarding",
    location: "Bengaluru HQ",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98450 11204",
    joinedMonthsAgo: 25,
    birthday: "05-09",
  },
  {
    name: "Diya Sharma",
    email: "diya.sharma@cadence.dev",
    role: "EMPLOYEE",
    designation: "Senior Software Engineer",
    department: "Engineering",
    team: "Product Engineering",
    location: "Bengaluru HQ",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+91 98450 11205",
    joinedMonthsAgo: 22,
    birthday: "01-30",
    bio: "Billing, invoicing and the public API. Usually online 10am–7pm IST.",
  },
  {
    name: "Arjun Nair",
    email: "arjun.nair@cadence.dev",
    role: "EMPLOYEE",
    designation: "Software Engineer",
    department: "Engineering",
    team: "Platform",
    location: "Remote — India",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+91 99000 11206",
    joinedMonthsAgo: 14,
    birthday: "09-17",
  },
  {
    name: "Sneha Kulkarni",
    email: "sneha.kulkarni@cadence.dev",
    role: "EMPLOYEE",
    designation: "Software Engineer",
    department: "Engineering",
    team: "Product Engineering",
    location: "Pune Studio",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+91 98220 11207",
    joinedMonthsAgo: 11,
    birthday: "04-05",
  },
  {
    name: "Karthik Subramanian",
    email: "karthik.s@cadence.dev",
    role: "EMPLOYEE",
    designation: "QA Engineer",
    department: "Engineering",
    team: "Quality",
    location: "Bengaluru HQ",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+91 98450 11208",
    joinedMonthsAgo: 19,
    birthday: "12-11",
  },
  {
    name: "Zoya Ahmed",
    email: "zoya.ahmed@cadence.dev",
    role: "EMPLOYEE",
    designation: "Site Reliability Engineer",
    department: "Engineering",
    team: "Platform",
    location: "Dubai Office",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+971 50 111 2209",
    joinedMonthsAgo: 8,
    birthday: "06-28",
  },
  {
    name: "Pranav Desai",
    email: "pranav.desai@cadence.dev",
    role: "EMPLOYEE",
    designation: "Frontend Engineer",
    department: "Engineering",
    team: "Product Engineering",
    location: "Remote — India",
    managerEmail: "rohan.mehta@cadence.dev",
    phone: "+91 99000 11210",
    joinedMonthsAgo: 5,
    birthday: "02-19",
  },
  {
    name: "Meera Pillai",
    email: "meera.pillai@cadence.dev",
    role: "EMPLOYEE",
    designation: "Product Designer",
    department: "Design",
    team: "Product Design",
    location: "Pune Studio",
    managerEmail: "neha.iyer@cadence.dev",
    phone: "+91 98220 11211",
    joinedMonthsAgo: 17,
    birthday: "08-08",
  },
  {
    name: "Tanvi Joshi",
    email: "tanvi.joshi@cadence.dev",
    role: "EMPLOYEE",
    designation: "UX Researcher",
    department: "Design",
    team: "Product Design",
    location: "Remote — India",
    managerEmail: "neha.iyer@cadence.dev",
    phone: "+91 99000 11212",
    joinedMonthsAgo: 7,
    birthday: "10-02",
  },
  {
    name: "Aditya Verma",
    email: "aditya.verma@cadence.dev",
    role: "EMPLOYEE",
    designation: "Support Engineer",
    department: "Customer Success",
    team: "Support",
    location: "Bengaluru HQ",
    managerEmail: "vikram.rao@cadence.dev",
    phone: "+91 98450 11213",
    joinedMonthsAgo: 20,
    birthday: "03-27",
  },
  {
    name: "Fatima Sheikh",
    email: "fatima.sheikh@cadence.dev",
    role: "EMPLOYEE",
    designation: "Onboarding Specialist",
    department: "Customer Success",
    team: "Onboarding",
    location: "Dubai Office",
    managerEmail: "vikram.rao@cadence.dev",
    phone: "+971 50 111 2214",
    joinedMonthsAgo: 13,
    birthday: "07-19",
  },
  {
    name: "Nikhil Bansal",
    email: "nikhil.bansal@cadence.dev",
    role: "EMPLOYEE",
    designation: "Support Engineer",
    department: "Customer Success",
    team: "Support",
    location: "Remote — India",
    managerEmail: "vikram.rao@cadence.dev",
    phone: "+91 99000 11215",
    joinedMonthsAgo: 4,
    birthday: "11-05",
  },
  {
    name: "Ananya Ghosh",
    email: "ananya.ghosh@cadence.dev",
    role: "EMPLOYEE",
    designation: "Account Executive",
    department: "Sales",
    team: "Enterprise",
    location: "Bengaluru HQ",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98450 11216",
    joinedMonthsAgo: 16,
    birthday: "05-22",
  },
  {
    name: "Siddharth Menon",
    email: "siddharth.menon@cadence.dev",
    role: "EMPLOYEE",
    designation: "Sales Development Rep",
    department: "Sales",
    team: "Inbound",
    location: "Bengaluru HQ",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98450 11217",
    joinedMonthsAgo: 9,
    birthday: "01-13",
  },
  {
    name: "Ritika Chawla",
    email: "ritika.chawla@cadence.dev",
    role: "EMPLOYEE",
    designation: "Content Marketer",
    department: "Marketing",
    team: "Content",
    location: "Remote — India",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 99000 11218",
    joinedMonthsAgo: 12,
    birthday: "09-04",
  },
  {
    name: "Harsh Patel",
    email: "harsh.patel@cadence.dev",
    role: "EMPLOYEE",
    designation: "Growth Marketer",
    department: "Marketing",
    team: "Content",
    location: "Pune Studio",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98220 11219",
    joinedMonthsAgo: 6,
    birthday: "04-16",
  },
  {
    name: "Lakshmi Reddy",
    email: "lakshmi.reddy@cadence.dev",
    role: "EMPLOYEE",
    designation: "People Operations Associate",
    department: "People & Operations",
    team: "People Ops",
    location: "Bengaluru HQ",
    managerEmail: "aisha.khan@cadence.dev",
    phone: "+91 98450 11220",
    joinedMonthsAgo: 3,
    birthday: "12-30",
  },
];

/** Department heads, by department name → email. */
export const DEPARTMENT_HEADS: Record<string, string> = {
  Engineering: "rohan.mehta@cadence.dev",
  Design: "neha.iyer@cadence.dev",
  "Customer Success": "vikram.rao@cadence.dev",
  "People & Operations": "aisha.khan@cadence.dev",
  Sales: "ananya.ghosh@cadence.dev",
  Marketing: "ritika.chawla@cadence.dev",
};

/**
 * Report content by department. Each entry is a task line; the generator picks a
 * few per day so no two reports read identically.
 */
export const TASKS_BY_DEPARTMENT: Record<string, string[]> = {
  Engineering: [
    "Shipped the invoice export endpoint behind a feature flag",
    "Fixed the pagination bug on the transactions list (#2841)",
    "Paired with Sneha on the auth refactor — session handling is done",
    "Reviewed 4 PRs, merged 3",
    "Cut p95 latency on /api/search from 480ms to 190ms with a covering index",
    "Migrated the webhook worker off the deprecated queue client",
    "Wrote integration tests for the billing reconciliation job",
    "Debugged the intermittent CI failure — it was a race in the test fixtures",
    "Added structured logging to the payment retry path",
    "Upgraded the Postgres driver and verified the connection pool under load",
    "Drafted the RFC for splitting the monolith's reporting module",
    "Fixed a memory leak in the CSV importer (unclosed streams)",
    "Set up the staging environment for the multi-region rollout",
    "Backfilled missing audit rows from the March incident",
    "Reduced the Docker image from 1.2GB to 340MB",
  ],
  Design: [
    "Finished the empty-state illustrations for the reporting module",
    "Ran three usability sessions on the new onboarding flow",
    "Audited colour contrast across the dashboard — six failures fixed",
    "Rebuilt the data-table component in the design system",
    "Prototyped the mobile navigation in Figma and shared for feedback",
    "Documented the spacing scale and handed it to engineering",
    "Reviewed the settings redesign with Rohan's team",
    "Synthesised research notes from last week's customer calls",
    "Iterated on the leave request form — cut it from three steps to one",
    "Specced the loading and error states for the analytics screens",
  ],
  "Customer Success": [
    "Cleared the support queue — 14 tickets, all first-response inside 2h",
    "Onboarded Northwind Systems; their admin training is booked",
    "Escalated the recurring sync failure for Acme to engineering with repro steps",
    "Wrote a help-centre article on bulk imports",
    "Ran the quarterly health review for three enterprise accounts",
    "Followed up on last week's churn-risk flags — two recovered",
    "Recorded a walkthrough video for the new reporting screens",
    "Updated the onboarding checklist based on the last five rollouts",
    "Handled the billing discrepancy for Vertex — refund processed",
    "Triaged eight bug reports and reproduced five",
  ],
  Sales: [
    "Six discovery calls; three moved to technical evaluation",
    "Sent the Northwind proposal — decision expected next week",
    "Closed the Meridian renewal, 18% expansion",
    "Updated the pipeline in the CRM and cleaned up stale opportunities",
    "Prepped the security questionnaire for the Vertex procurement team",
    "Ran a demo for a 60-seat prospect in Dubai",
    "Followed up on 20 inbound leads from the webinar",
    "Worked with Ritika on the case-study draft for Acme",
  ],
  Marketing: [
    "Published the launch post for the analytics module",
    "Drafted the case study with Ananya — awaiting customer sign-off",
    "Rebuilt the pricing page copy; A/B test starts Monday",
    "Analysed last month's funnel — signup-to-activation is up 6 points",
    "Scheduled next week's newsletter and the three social posts",
    "Interviewed two customers for the testimonial reel",
    "Fixed the broken canonical tags flagged in the SEO audit",
    "Set up the webinar registration flow and confirmed the speakers",
  ],
  "People & Operations": [
    "Closed out the month's payroll inputs and reconciled leave balances",
    "Ran two first-round interviews for the platform engineer role",
    "Finalised the H2 holiday calendar and published it",
    "Reviewed the laptop refresh quotes — going with the second vendor",
    "Onboarded Lakshmi: accounts, hardware and buddy assigned",
    "Updated the leave policy wording after the legal review",
    "Collated the engagement survey results for the leadership review",
    "Renewed the office insurance and filed the paperwork",
  ],
};

export const BLOCKERS = [
  "Waiting on staging credentials from IT — should land tomorrow",
  "Blocked on the customer's SSO metadata; chased twice",
  "Need a decision on the pricing tiers before I can finish the page",
  "Flaky CI is slowing reviews down; looking into it",
  "Awaiting design sign-off on the empty states",
  "The vendor's sandbox has been down since yesterday",
  "Need 30 minutes with Rohan on the migration sequencing",
];

export const NEXT_STEPS_BY_DEPARTMENT: Record<string, string[]> = {
  Engineering: [
    "- Finish the CSV importer\n- Write tests for the webhook handler",
    "- Land the search index migration\n- Start on the rate limiter",
    "- Review Diya's PR\n- Draft the incident postmortem",
    "- Pair with Zoya on the alerting rules",
  ],
  Design: [
    "- Hand off the mobile nav spec\n- Start the analytics empty states",
    "- Second round of usability testing\n- Update the component docs",
    "- Contrast audit on the dark theme",
  ],
  "Customer Success": [
    "- Northwind admin training\n- Close out the remaining P2 tickets",
    "- Draft the Q3 health reviews\n- Update the onboarding checklist",
  ],
  Sales: [
    "- Follow up on the Northwind proposal\n- Two demos booked",
    "- Prep the enterprise security review\n- Clean up the pipeline",
  ],
  Marketing: [
    "- Launch the pricing A/B test\n- Finish the case study",
    "- Newsletter draft\n- Webinar dry run",
  ],
  "People & Operations": [
    "- Second-round interviews\n- Publish the updated leave policy",
    "- Close payroll\n- Kick off the laptop refresh",
  ],
};

export const NOTES = [
  "Nothing blocking — good week.",
  "Slightly short day, dentist appointment in the afternoon.",
  "Handing the deploy checklist to Priya while I'm away next week.",
  "Worth discussing the on-call rotation at the next team meeting.",
  "Customer asked about SSO again — third time this month.",
];

export const LEAVE_REASONS = [
  "Family wedding — will hand over open work beforehand.",
  "Down with a fever, resting up.",
  "Short trip home to see family.",
  "Medical appointment and follow-up scan.",
  "Moving flats — need a day for the handover.",
  "Attending a conference (personal, not company-funded).",
  "Childcare cover during school holidays.",
  "Recovering from a stomach bug.",
  "Festival at home; taking the long weekend.",
  "Passport renewal appointment.",
];

/** Indian public holidays for the seeded period, plus two company days. */
export const HOLIDAYS: Array<{ name: string; monthDay: string; type: "PUBLIC" | "OPTIONAL" | "COMPANY" }> = [
  { name: "New Year's Day", monthDay: "01-01", type: "PUBLIC" },
  { name: "Republic Day", monthDay: "01-26", type: "PUBLIC" },
  { name: "Holi", monthDay: "03-04", type: "PUBLIC" },
  { name: "Good Friday", monthDay: "04-03", type: "OPTIONAL" },
  { name: "Labour Day", monthDay: "05-01", type: "OPTIONAL" },
  { name: "Independence Day", monthDay: "08-15", type: "PUBLIC" },
  { name: "Gandhi Jayanti", monthDay: "10-02", type: "PUBLIC" },
  { name: "Diwali", monthDay: "11-08", type: "PUBLIC" },
  { name: "Christmas Day", monthDay: "12-25", type: "PUBLIC" },
  { name: "Company Offsite", monthDay: "09-18", type: "COMPANY" },
  { name: "Founders' Day", monthDay: "06-12", type: "COMPANY" },
];

export const ANNOUNCEMENTS = [
  {
    authorEmail: "aisha.khan@cadence.dev",
    title: "Cadence is now the single place for daily reports",
    body:
      "From this week, daily status reports live here instead of the spreadsheet.\n\n" +
      "**What changes**\n\n" +
      "- Write your report from the dashboard — it takes about two minutes\n" +
      "- Attendance is marked automatically when you submit\n" +
      "- Leave balances update themselves once a request is approved\n\n" +
      "The old sheet is read-only from Friday. If anything looks wrong on your profile, tell me and I'll fix it.",
    pinned: true,
    daysAgo: 12,
    audience: "ALL" as const,
  },
  {
    authorEmail: "aisha.khan@cadence.dev",
    title: "Holiday calendar for the second half of the year is published",
    body:
      "The H2 calendar is now on the [Calendar](/calendar) screen, including the two company days.\n\n" +
      "Optional holidays still need a leave request — public and company days don't.",
    pinned: false,
    daysAgo: 6,
    audience: "ALL" as const,
  },
  {
    authorEmail: "rohan.mehta@cadence.dev",
    title: "Multi-region migration: freeze on schema changes next week",
    body:
      "We're cutting over the primary database on Wednesday evening.\n\n" +
      "- No migrations merged after Monday 6pm\n" +
      "- Expect ~10 minutes of read-only mode during the cutover\n" +
      "- I'll post here when it's done\n\n" +
      "Shout if this blocks something you've got planned.",
    pinned: false,
    daysAgo: 3,
    audience: "DEPARTMENT" as const,
    department: "Engineering",
  },
];
