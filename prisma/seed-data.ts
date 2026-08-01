/**
 * Demo content for the seed — Pooja Machines Private Limited.
 *
 * Split from `seed.ts` so the generation logic stays readable. The writing here is
 * deliberately specific — "Re-cut the feed-dog cam on the tool-room lathe" rather
 * than "Worked on tasks" — because a demo with generic filler reads as a mock-up,
 * while one with plausible detail reads as a product in use.
 *
 * The company makes **sewing machines and fans**, so the vocabulary is a real
 * factory's: bed castings and feed dogs on the sewing side, stator windings and
 * blade balancing on the fan side, with a tool room and a dispatch bay behind both.
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
  {
    name: "Ludhiana Plant",
    code: "LDH",
    city: "Ludhiana",
    country: "India",
    timezone: "Asia/Kolkata",
  },
  {
    name: "Noida Fan Unit",
    code: "NOI",
    city: "Noida",
    country: "India",
    timezone: "Asia/Kolkata",
  },
  {
    name: "Delhi Head Office",
    code: "DEL",
    city: "New Delhi",
    country: "India",
    timezone: "Asia/Kolkata",
  },
  {
    name: "Field — North India",
    code: "FLD",
    city: "On the road",
    country: "India",
    timezone: "Asia/Kolkata",
  },
] as const;

export const DEPARTMENTS = [
  {
    name: "Production",
    color: "indigo",
    description: "Assembles sewing machines and fans, and runs the machine shop.",
    teams: ["Sewing Machine Assembly", "Fan Assembly", "Machine Shop"],
  },
  {
    name: "Quality Assurance",
    color: "violet",
    description: "Checks incoming material and tests every finished unit before it ships.",
    teams: ["Incoming Inspection", "Final Testing"],
  },
  {
    name: "Maintenance & Tooling",
    color: "amber",
    description: "Keeps the plant running, and cuts and repairs the tooling it runs on.",
    teams: ["Plant Maintenance", "Tool Room"],
  },
  {
    name: "Stores & Dispatch",
    color: "teal",
    description: "Raw material, finished goods and everything that leaves the gate.",
    teams: ["Stores", "Dispatch"],
  },
  {
    name: "Sales & Service",
    color: "emerald",
    description: "Dealer network across north India, and after-sales service.",
    teams: ["Dealer Sales", "After-Sales Service"],
  },
  {
    name: "Accounts & Administration",
    color: "orange",
    description: "Accounts, payroll, statutory filings and plant administration.",
    teams: ["Accounts", "HR & Admin"],
  },
] as const;

/**
 * Twenty people with a realistic factory reporting structure: five line managers
 * reporting to the works manager, and the rest distributed beneath them.
 */
export const PEOPLE: SeedPerson[] = [
  {
    name: "Anil Kumar Gupta",
    email: "anil.gupta@poojamachines.co.in",
    role: "ADMIN",
    designation: "General Manager — Works",
    department: "Accounts & Administration",
    team: "HR & Admin",
    location: "Delhi Head Office",
    managerEmail: null,
    phone: "+91 98110 42101",
    joinedMonthsAgo: 96,
    birthday: "03-14",
    bio: "Runs both units and this portal. Come to me on approvals, expenses or anything HR.",
  },
  {
    name: "Harpreet Singh",
    email: "harpreet.singh@poojamachines.co.in",
    role: "MANAGER",
    designation: "Production Manager",
    department: "Production",
    team: "Sewing Machine Assembly",
    location: "Ludhiana Plant",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98140 42102",
    joinedMonthsAgo: 68,
    birthday: "07-02",
    bio: "Sewing machine and fan lines. Currently pushing the JK-2 bed casting changeover.",
  },
  {
    name: "Suresh Chandra Yadav",
    email: "suresh.yadav@poojamachines.co.in",
    role: "MANAGER",
    designation: "Quality Manager",
    department: "Quality Assurance",
    team: "Final Testing",
    location: "Ludhiana Plant",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98140 42103",
    joinedMonthsAgo: 54,
    birthday: "11-23",
    bio: "Final testing and incoming inspection. The ISO documentation lives with me.",
  },
  {
    name: "Deepak Sharma",
    email: "deepak.sharma@poojamachines.co.in",
    role: "MANAGER",
    designation: "Sales Manager — North",
    department: "Sales & Service",
    team: "Dealer Sales",
    location: "Delhi Head Office",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98110 42104",
    joinedMonthsAgo: 47,
    birthday: "05-09",
    bio: "Dealer network from Amritsar to Kanpur. Ask me before you promise a delivery date.",
  },
  {
    name: "Rekha Devi Verma",
    email: "rekha.verma@poojamachines.co.in",
    role: "MANAGER",
    designation: "Stores & Dispatch In-charge",
    department: "Stores & Dispatch",
    team: "Stores",
    location: "Noida Fan Unit",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98110 42105",
    joinedMonthsAgo: 39,
    birthday: "01-18",
    bio: "Stock, dispatch and the e-way bills. Nothing leaves the gate without a challan.",
  },
  {
    name: "Mohan Lal Prajapati",
    email: "mohan.prajapati@poojamachines.co.in",
    role: "MANAGER",
    designation: "Maintenance Manager",
    department: "Maintenance & Tooling",
    team: "Plant Maintenance",
    location: "Ludhiana Plant",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98140 42106",
    joinedMonthsAgo: 61,
    birthday: "09-27",
    bio: "Machines, compressors, wiring and the tool room. Twenty-two years on this floor.",
  },

  // --- Production -----------------------------------------------------------
  {
    name: "Ramesh Kumar Sahu",
    email: "ramesh.sahu@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Senior Fitter — Sewing Machine Assembly",
    department: "Production",
    team: "Sewing Machine Assembly",
    location: "Ludhiana Plant",
    managerEmail: "harpreet.singh@poojamachines.co.in",
    phone: "+91 98140 42107",
    joinedMonthsAgo: 44,
    birthday: "02-11",
    bio: "Head assembly and timing setting on the domestic straight-stitch line.",
  },
  {
    name: "Vinod Kumar Meena",
    email: "vinod.meena@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Assembly Line Operator — Fans",
    department: "Production",
    team: "Fan Assembly",
    location: "Noida Fan Unit",
    managerEmail: "harpreet.singh@poojamachines.co.in",
    phone: "+91 98110 42108",
    joinedMonthsAgo: 28,
    birthday: "08-04",
  },
  {
    name: "Kavita Rani",
    email: "kavita.rani@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Winding Operator — Fan Motors",
    department: "Production",
    team: "Fan Assembly",
    location: "Noida Fan Unit",
    managerEmail: "harpreet.singh@poojamachines.co.in",
    phone: "+91 98110 42109",
    joinedMonthsAgo: 22,
    birthday: "06-21",
    bio: "Stator winding and testing for ceiling and table fan motors.",
  },
  {
    name: "Satish Chandra Dubey",
    email: "satish.dubey@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "CNC Machinist",
    department: "Production",
    team: "Machine Shop",
    location: "Ludhiana Plant",
    managerEmail: "harpreet.singh@poojamachines.co.in",
    phone: "+91 98140 42110",
    joinedMonthsAgo: 33,
    birthday: "10-08",
    bio: "Turning and milling on the two VMCs — bed castings, shafts and hand-wheel blanks.",
  },
  {
    name: "Manoj Kumar Patel",
    email: "manoj.patel@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Paint & Finishing Operator",
    department: "Production",
    team: "Machine Shop",
    location: "Ludhiana Plant",
    managerEmail: "harpreet.singh@poojamachines.co.in",
    phone: "+91 98140 42111",
    joinedMonthsAgo: 17,
    birthday: "04-30",
  },

  // --- Quality Assurance ----------------------------------------------------
  {
    name: "Neelam Kumari Singh",
    email: "neelam.singh@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Quality Inspector — Final Testing",
    department: "Quality Assurance",
    team: "Final Testing",
    location: "Ludhiana Plant",
    managerEmail: "suresh.yadav@poojamachines.co.in",
    phone: "+91 98140 42112",
    joinedMonthsAgo: 26,
    birthday: "12-05",
    bio: "Runs the stitch-quality and noise checks before a machine is boxed.",
  },
  {
    name: "Ashok Kumar Bind",
    email: "ashok.bind@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Incoming Material Inspector",
    department: "Quality Assurance",
    team: "Incoming Inspection",
    location: "Ludhiana Plant",
    managerEmail: "suresh.yadav@poojamachines.co.in",
    phone: "+91 98140 42113",
    joinedMonthsAgo: 14,
    birthday: "07-19",
  },

  // --- Maintenance & Tooling ------------------------------------------------
  {
    name: "Rajendra Prasad Tiwari",
    email: "rajendra.tiwari@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Tool Room Technician",
    department: "Maintenance & Tooling",
    team: "Tool Room",
    location: "Ludhiana Plant",
    managerEmail: "mohan.prajapati@poojamachines.co.in",
    phone: "+91 98140 42114",
    joinedMonthsAgo: 51,
    birthday: "05-02",
    bio: "Grinds and repairs press tools, jigs and fixtures for both units.",
  },
  {
    name: "Imran Khan",
    email: "imran.khan@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Electrician — Plant Maintenance",
    department: "Maintenance & Tooling",
    team: "Plant Maintenance",
    location: "Noida Fan Unit",
    managerEmail: "mohan.prajapati@poojamachines.co.in",
    phone: "+91 98110 42115",
    joinedMonthsAgo: 19,
    birthday: "09-13",
  },

  // --- Stores & Dispatch ----------------------------------------------------
  {
    name: "Sunita Devi Kushwaha",
    email: "sunita.kushwaha@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Stores Assistant",
    department: "Stores & Dispatch",
    team: "Stores",
    location: "Noida Fan Unit",
    managerEmail: "rekha.verma@poojamachines.co.in",
    phone: "+91 98110 42116",
    joinedMonthsAgo: 11,
    birthday: "03-26",
  },
  {
    name: "Pankaj Kumar Gupta",
    email: "pankaj.gupta@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Dispatch Coordinator",
    department: "Stores & Dispatch",
    team: "Dispatch",
    location: "Ludhiana Plant",
    managerEmail: "rekha.verma@poojamachines.co.in",
    phone: "+91 98140 42117",
    joinedMonthsAgo: 24,
    birthday: "11-07",
    bio: "Loading, LR copies and transporter follow-up. Everything with a docket number.",
  },

  // --- Sales & Service ------------------------------------------------------
  {
    name: "Arvind Kumar Jha",
    email: "arvind.jha@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Territory Sales Executive",
    department: "Sales & Service",
    team: "Dealer Sales",
    location: "Field — North India",
    managerEmail: "deepak.sharma@poojamachines.co.in",
    phone: "+91 98110 42118",
    joinedMonthsAgo: 20,
    birthday: "01-29",
    bio: "Punjab and Haryana dealers. On the road four days a week.",
  },
  {
    name: "Shabana Parveen",
    email: "shabana.parveen@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Service Engineer",
    department: "Sales & Service",
    team: "After-Sales Service",
    location: "Field — North India",
    managerEmail: "deepak.sharma@poojamachines.co.in",
    phone: "+91 98110 42119",
    joinedMonthsAgo: 9,
    birthday: "08-16",
    bio: "Warranty calls and dealer technician training across the NCR.",
  },

  // --- Accounts & Administration -------------------------------------------
  {
    name: "Gopal Krishna Nair",
    email: "gopal.nair@poojamachines.co.in",
    role: "EMPLOYEE",
    designation: "Accounts Assistant",
    department: "Accounts & Administration",
    team: "Accounts",
    location: "Delhi Head Office",
    managerEmail: "anil.gupta@poojamachines.co.in",
    phone: "+91 98110 42120",
    joinedMonthsAgo: 6,
    birthday: "12-30",
  },
];

/** Department heads, by department name → email. */
export const DEPARTMENT_HEADS: Record<string, string> = {
  Production: "harpreet.singh@poojamachines.co.in",
  "Quality Assurance": "suresh.yadav@poojamachines.co.in",
  "Maintenance & Tooling": "mohan.prajapati@poojamachines.co.in",
  "Stores & Dispatch": "rekha.verma@poojamachines.co.in",
  "Sales & Service": "deepak.sharma@poojamachines.co.in",
  "Accounts & Administration": "anil.gupta@poojamachines.co.in",
};

/**
 * Report content by department. Each entry is a task line; the generator picks a
 * few per day so no two reports read identically.
 */
export const TASKS_BY_DEPARTMENT: Record<string, string[]> = {
  Production: [
    "Completed 180 heads on the domestic straight-stitch line — 12 over target",
    "Set the feed-dog timing on the JK-2 batch after the cam change",
    "Ran the fan assembly line at 240 units; two rejected for blade wobble",
    "Balanced 320 ceiling fan blade sets on the new jig",
    "Changed the machine shop over from bed castings to hand-wheel blanks",
    "Cleared the 60 table-fan bodies that were held for paint touch-up",
    "Trained Vinod on the capacitor fitting station",
    "Wound 140 stators; all passed the insulation-resistance check",
    "Reworked 18 machines returned by final testing for bobbin-case noise",
    "Turned 220 needle-bar shafts on VMC-2, held to 0.02 mm",
    "Started the second-shift trial on the fan line — output up 9%",
    "Fitted and aligned 95 motor housings on the pedestal fan batch",
    "Cleaned and re-set the press tool after the burr complaint from QA",
    "Packed 150 domestic machines for the Ludhiana dealer order",
    "Sorted through the paint rejects — 22 salvageable, 6 scrapped",
  ],
  "Quality Assurance": [
    "Tested 210 finished machines; 4 held for stitch-length variation",
    "Cleared the incoming lot of 5,000 needles from Amrit Steel — sample pass",
    "Rejected the bearing consignment; 11 of 40 outside tolerance",
    "Ran the noise check on the ceiling fan batch — two above 42 dB, sent back",
    "Updated the inspection checklist after the feed-dog complaint",
    "Calibrated the three vernier sets and the micrometer for the month",
    "Audited the fan blade balancing station and closed two observations",
    "Prepared the ISO internal audit file for next month",
    "Verified insulation resistance on 140 wound stators",
    "Traced the stitch-skipping complaint from Kanpur to a hook timing error",
    "Checked the first-off sample from the new hand-wheel tool — approved",
    "Recorded the week's rejection summary: 2.1%, down from 3.4%",
  ],
  "Maintenance & Tooling": [
    "Replaced the drive belt and bearings on the pillar drill",
    "Re-cut the feed-dog cam on the tool-room lathe",
    "Attended the VMC-2 spindle alarm — coolant sensor, cleaned and reset",
    "Serviced the air compressor; changed the oil and the intake filter",
    "Rewired the fan-line testing panel after the earth leakage trip",
    "Ground and polished the blade-blanking press tool",
    "Fixed the conveyor at the packing station — the sprocket had shifted",
    "Completed the monthly preventive schedule on all six presses",
    "Made a new locating fixture for the motor housing bore",
    "Sorted the tool crib and tagged 40 items for regrinding",
    "Repaired the winding machine's tension arm",
    "Checked every emergency stop on the assembly lines — one replaced",
  ],
  "Stores & Dispatch": [
    "Received and binned 12,000 fasteners against PO-4471",
    "Dispatched 150 domestic machines to Amritsar — LR 88213",
    "Generated e-way bills for four outward consignments",
    "Reconciled the fan motor stock; 22 units short, traced to a mis-posting",
    "Issued raw material to the machine shop against three requisitions",
    "Loaded the Kanpur order — 90 pedestal fans, two-tier stacking",
    "Followed up with the transporter on the delayed Jalandhar delivery",
    "Completed the monthly physical count of the fast-moving bins",
    "Packed and sent 35 warranty replacement parts to dealers",
    "Cleared the inward gate register and filed the challans",
    "Raised a shortage note on the bearing consignment for QA to verify",
  ],
  "Sales & Service": [
    "Visited five dealers in Jalandhar; collected orders for 220 machines",
    "Closed the Ludhiana Sewing Centre order — 150 units, 30-day credit",
    "Attended a warranty call at Sharma Electricals — motor replaced under warranty",
    "Trained four dealer technicians on the JK-2 timing adjustment",
    "Followed up on outstanding payments from three dealers",
    "Collected feedback on the new table fan — dealers want a darker finish",
    "Resolved the stitch-skipping complaint from the Kanpur dealer on site",
    "Prepared the quotation for the Karnal tailoring institute — 40 machines",
    "Serviced six fans at the Gurugram dealer's service counter",
    "Updated the dealer price list and circulated it",
    "Manned the Ludhiana trade fair stall for the day",
  ],
  "Accounts & Administration": [
    "Closed the month's purchase entries and matched the GST input register",
    "Processed the wage sheet for both units and reconciled overtime",
    "Filed the monthly GSTR-1 and saved the acknowledgement",
    "Cleared 14 expense claims and passed them for payment",
    "Reconciled the bank statement — two entries pending from the transporter",
    "Renewed the factory licence and filed the fire-safety certificate",
    "Followed up with Deepak on receivables over 60 days",
    "Prepared the annual ESI and PF returns paperwork",
    "Onboarded Gopal: attendance card, bank details and PF number done",
    "Booked the travel for the Ludhiana trade fair team",
  ],
};

export const BLOCKERS = [
  "Bearing consignment rejected by QA — the line stops on Thursday without stock",
  "Waiting on the tool room to finish the hand-wheel die",
  "Power cut for three hours yesterday; the fan line lost half a shift",
  "Transporter hasn't confirmed the Jalandhar vehicle yet",
  "Need Harpreet's approval on the second-shift overtime",
  "Short on capacitors — the purchase order is raised but not confirmed",
  "VMC-2 spindle is running warm; want maintenance to look before I load it",
  "Dealer hasn't sent the faulty motor back, so I can't close the warranty claim",
];

export const NEXT_STEPS_BY_DEPARTMENT: Record<string, string[]> = {
  Production: [
    "- Finish the JK-2 changeover\n- Start the pedestal fan batch",
    "- Clear the 22 paint reworks\n- Set up the second-shift trial",
    "- Wind the remaining 60 stators\n- Hand over to Kavita for testing",
    "- Load VMC-2 with the shaft batch\n- Check the first-off with QA",
  ],
  "Quality Assurance": [
    "- Re-check the returned bearing lot\n- Close the two audit observations",
    "- Calibrate the remaining gauges\n- Update the inspection checklist",
    "- First-off approval on the new tool\n- Compile the rejection summary",
  ],
  "Maintenance & Tooling": [
    "- Finish the blade-blanking tool\n- Preventive schedule on the presses",
    "- Sort the tool crib\n- Replace the conveyor sprocket",
    "- Look at the VMC-2 spindle\n- Service the second compressor",
  ],
  "Stores & Dispatch": [
    "- Load the Kanpur order\n- Generate the e-way bills",
    "- Physical count of the fast-moving bins\n- Chase the transporter",
    "- Bin the incoming fasteners\n- Raise the shortage note",
  ],
  "Sales & Service": [
    "- Jalandhar dealer visits\n- Send the Karnal quotation",
    "- Close the warranty call at Sharma Electricals\n- Collect the pending payments",
    "- Dealer technician training\n- Circulate the revised price list",
  ],
  "Accounts & Administration": [
    "- File GSTR-1\n- Pass the pending expense claims",
    "- Close the wage sheet\n- Reconcile the bank statement",
    "- Factory licence renewal\n- ESI and PF returns",
  ],
};

export const NOTES = [
  "Nothing blocking — good week on the line.",
  "Left early for a dentist appointment; made the hours up on Saturday.",
  "Handing the dispatch register to Pankaj while I'm away next week.",
  "Worth discussing the second shift at the next production meeting.",
  "Dealer asked about the darker finish again — third time this month.",
  "Power was off for two hours in the afternoon.",
];

export const LEAVE_REASONS = [
  "Family wedding in the village — will hand over open work beforehand.",
  "Down with fever, resting up.",
  "Going home to Gorakhpur for a few days.",
  "Medical appointment and a follow-up scan.",
  "Shifting house — need a day for the move.",
  "Child's school function.",
  "Recovering from a stomach infection.",
  "Festival at home; taking the long weekend.",
  "Aadhaar and passport work at the Delhi office.",
  "Attending a relative's funeral.",
];

/** Indian public holidays for the seeded period, plus two company days. */
export const HOLIDAYS: Array<{
  name: string;
  monthDay: string;
  type: "PUBLIC" | "OPTIONAL" | "COMPANY";
}> = [
  { name: "New Year's Day", monthDay: "01-01", type: "PUBLIC" },
  { name: "Republic Day", monthDay: "01-26", type: "PUBLIC" },
  { name: "Holi", monthDay: "03-04", type: "PUBLIC" },
  { name: "Baisakhi", monthDay: "04-14", type: "PUBLIC" },
  { name: "Labour Day", monthDay: "05-01", type: "OPTIONAL" },
  { name: "Independence Day", monthDay: "08-15", type: "PUBLIC" },
  { name: "Gandhi Jayanti", monthDay: "10-02", type: "PUBLIC" },
  { name: "Dussehra", monthDay: "10-21", type: "PUBLIC" },
  { name: "Diwali", monthDay: "11-08", type: "PUBLIC" },
  { name: "Guru Nanak Jayanti", monthDay: "11-15", type: "OPTIONAL" },
  { name: "Christmas Day", monthDay: "12-25", type: "OPTIONAL" },
  { name: "Annual Plant Maintenance Shutdown", monthDay: "09-18", type: "COMPANY" },
  { name: "Founder's Day", monthDay: "06-12", type: "COMPANY" },
];

export const ANNOUNCEMENTS = [
  {
    authorEmail: "anil.gupta@poojamachines.co.in",
    title: "Daily reports and expense claims now go through this portal",
    body:
      "From this week, the daily report and every expense claim live here instead of on paper.\n\n" +
      "**What changes**\n\n" +
      "- Write your report from the dashboard — it takes about two minutes\n" +
      "- Attendance is marked automatically when you submit\n" +
      "- Leave balances update themselves once a request is approved\n" +
      "- **Expense claims**: photograph the bill, file the claim, and you can see exactly where it has reached\n\n" +
      "The register in the supervisor's cabin stops on Friday. If anything looks wrong on your profile, tell me and I will fix it.",
    pinned: true,
    daysAgo: 12,
    audience: "ALL" as const,
  },
  {
    authorEmail: "anil.gupta@poojamachines.co.in",
    title: "Expense claims: what Accounts needs on the bill",
    body:
      "A few claims came back last month for the same reasons, so to save everyone a round trip:\n\n" +
      "- **Attach the bill.** A claim without a photo of the bill takes much longer to pass.\n" +
      "- **One claim, one bill.** If a bill covers two people, split it and each file your own share.\n" +
      "- **File within 120 days.** Anything older has to go through Accounts directly.\n" +
      "- Travel and fuel for dealer visits: write which dealer and which vehicle in the description.\n\n" +
      "Approved claims go out with the month's payout. You get an email either way.",
    pinned: false,
    daysAgo: 7,
    audience: "ALL" as const,
  },
  {
    authorEmail: "anil.gupta@poojamachines.co.in",
    title: "Holiday calendar for the second half of the year is published",
    body:
      "The calendar is now on the [Calendar](/calendar) screen, including the plant maintenance shutdown in September.\n\n" +
      "Optional holidays still need a leave request — public and company days don't.",
    pinned: false,
    daysAgo: 6,
    audience: "ALL" as const,
  },
  {
    authorEmail: "harpreet.singh@poojamachines.co.in",
    title: "JK-2 bed casting changeover: line stoppage on Wednesday",
    body:
      "We're changing the sewing machine line over to the revised JK-2 bed casting on Wednesday.\n\n" +
      "- Assembly stops from 2pm; the tool change takes about three hours\n" +
      "- Machine shop: please keep 200 hand-wheel blanks ready beforehand\n" +
      "- QA will do a first-off approval before we resume\n\n" +
      "Tell me if this clashes with something you have planned.",
    pinned: false,
    daysAgo: 3,
    audience: "DEPARTMENT" as const,
    department: "Production",
  },
];

// ---------------------------------------------------------------------------
//  Expense claims
// ---------------------------------------------------------------------------

export interface SeedExpense {
  claimantEmail: string;
  title: string;
  description: string;
  category:
    | "TRAVEL"
    | "FUEL"
    | "FREIGHT"
    | "TOOLS"
    | "MATERIALS"
    | "MEALS"
    | "LODGING"
    | "REPAIRS"
    | "OFFICE"
    | "OTHER";
  /** Rupees. The seed converts to paise, so the demo data reads naturally here. */
  amount: number;
  daysAgo: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REIMBURSED" | "CANCELLED";
  vendor?: string;
  referenceNo?: string;
  decisionNote?: string;
  /** Thread on the claim, in order. `fromAdmin` decides which side wrote it. */
  comments?: Array<{ fromAdmin: boolean; body: string; daysAfter: number }>;
}

/**
 * Claims across every state, so each status has something real behind it: a queue
 * for the admin to work through, approved-but-unpaid money for the payout list,
 * and — importantly — declined claims whose notes actually say what to do next,
 * plus a few threads showing the back-and-forth the module exists to capture.
 */
export const EXPENSES: SeedExpense[] = [
  // --- Waiting on a decision (the admin's queue) ---------------------------
  {
    claimantEmail: "arvind.jha@poojamachines.co.in",
    title: "Bus and auto fare for Jalandhar dealer visits",
    description:
      "Two days covering five dealers in Jalandhar and Phagwara. Bus both ways plus autos between the shops. Collected orders for 220 machines — details are in Monday's report.",
    category: "TRAVEL",
    amount: 1840,
    daysAgo: 4,
    status: "SUBMITTED",
    vendor: "PRTC / local autos",
  },
  {
    claimantEmail: "shabana.parveen@poojamachines.co.in",
    title: "Replacement capacitor bought locally for a warranty call",
    description:
      "Sharma Electricals in Gurugram had a customer fan down and the dealer had no stock of the 2.5 mfd capacitor. Bought one from the market to close the call the same day rather than make the customer wait for a dispatch.",
    category: "TOOLS",
    amount: 260,
    daysAgo: 3,
    status: "SUBMITTED",
    vendor: "Janpath Electricals, Gurugram",
    referenceNo: "1142",
  },
  {
    claimantEmail: "pankaj.gupta@poojamachines.co.in",
    title: "Loading labour for the Amritsar consignment",
    description:
      "The regular loaders were short on Saturday and the vehicle had to leave the same evening for the Amritsar dealer. Paid four casual loaders for the 150-machine consignment, LR 88213.",
    category: "FREIGHT",
    amount: 2400,
    daysAgo: 2,
    status: "SUBMITTED",
    vendor: "Casual labour — gate register",
  },
  {
    claimantEmail: "rajendra.tiwari@poojamachines.co.in",
    title: "Regrinding two press tools at an outside shop",
    description:
      "Our surface grinder is down waiting for a spindle bearing, so the blade-blanking and bed-plate tools were reground outside. Both checked and back in the crib.",
    category: "REPAIRS",
    amount: 3200,
    daysAgo: 5,
    status: "SUBMITTED",
    vendor: "Guru Nanak Grinding Works",
    referenceNo: "GN-2291",
  },
  {
    claimantEmail: "arvind.jha@poojamachines.co.in",
    title: "Diesel — Karnal and Panipat dealer trip",
    description:
      "Used my own vehicle for the Karnal tailoring institute quotation and two dealer visits in Panipat, as the company car was with Deepak sir. 310 km round trip.",
    category: "FUEL",
    amount: 2650,
    daysAgo: 6,
    status: "SUBMITTED",
    vendor: "HP Petrol Pump, NH-44",
    referenceNo: "4471902",
  },

  // --- Approved, waiting on payment (the payout list) ---------------------
  {
    claimantEmail: "shabana.parveen@poojamachines.co.in",
    title: "Train fare and one night's stay for the Kanpur complaint",
    description:
      "Went to Kanpur for the stitch-skipping complaint the dealer had raised three times. Traced it to a hook timing error and trained their technician on the correction. Train both ways, one night at a guest house near the dealer.",
    category: "LODGING",
    amount: 4380,
    daysAgo: 14,
    status: "APPROVED",
    vendor: "IRCTC / Hotel Saraswati",
    referenceNo: "PNR-8842116",
    decisionNote: "Approved. Good that it was closed on site — it goes out with this month's payout.",
    comments: [
      {
        fromAdmin: true,
        body: "Was the guest house the one we normally use? The rate looks higher than last time.",
        daysAfter: 1,
      },
      {
        fromAdmin: false,
        body: "No sir, the usual one was full because of the wedding season. This was the nearest to the dealer. Bill is attached.",
        daysAfter: 1,
      },
    ],
  },
  {
    claimantEmail: "mohan.prajapati@poojamachines.co.in",
    title: "Compressor oil and intake filter",
    description:
      "Monthly service of the main air compressor at Ludhiana. Bought the oil and the intake filter locally as stores had none, and the line cannot run without air.",
    category: "MATERIALS",
    amount: 1950,
    daysAgo: 18,
    status: "APPROVED",
    vendor: "Bharat Industrial Supplies",
    referenceNo: "BIS-7734",
    decisionNote: "Fine. Please raise an indent so stores keeps a spare filter from now on.",
  },
  {
    claimantEmail: "deepak.sharma@poojamachines.co.in",
    title: "Stall expenses at the Ludhiana trade fair",
    description:
      "Printing for the dealer price list and product cards, plus tea and water for the stall over two days. Footfall was good — eleven new dealer enquiries, list shared with Anil sir.",
    category: "OFFICE",
    amount: 6750,
    daysAgo: 21,
    status: "APPROVED",
    vendor: "Shree Printers + stall catering",
    referenceNo: "SP-1188",
    decisionNote: "Approved. Worth doing again next year.",
  },
  {
    claimantEmail: "satish.dubey@poojamachines.co.in",
    title: "Carbide inserts for VMC-2",
    description:
      "Ran out of inserts halfway through the needle-bar shaft batch. Bought a box of ten from the market so the batch could be finished the same day instead of waiting for the purchase order.",
    category: "TOOLS",
    amount: 4100,
    daysAgo: 24,
    status: "APPROVED",
    vendor: "Punjab Tools Corner",
    referenceNo: "PTC-4402",
    decisionNote: "Approved, but check with the tool room before buying inserts outside next time.",
  },

  // --- Reimbursed (closed and paid) ---------------------------------------
  {
    claimantEmail: "arvind.jha@poojamachines.co.in",
    title: "Diesel and tolls — Amritsar dealer meet",
    description:
      "Drove to Amritsar for the quarterly dealer meet and stayed back a day to settle the Ludhiana Sewing Centre order. Diesel plus tolls both ways.",
    category: "FUEL",
    amount: 3420,
    daysAgo: 38,
    status: "REIMBURSED",
    vendor: "Indian Oil, GT Road",
    referenceNo: "IO-99213",
    decisionNote: "Approved.",
  },
  {
    claimantEmail: "rekha.verma@poojamachines.co.in",
    title: "Packing material for the pedestal fan order",
    description:
      "Extra corrugated boxes and strapping for the 90-fan Kanpur order — two-tier stacking needed heavier boxes than the standard ones we hold.",
    category: "MATERIALS",
    amount: 5240,
    daysAgo: 45,
    status: "REIMBURSED",
    vendor: "Noida Packaging House",
    referenceNo: "NPH-3312",
    decisionNote: "Approved. Add the heavier box to the regular indent.",
  },
  {
    claimantEmail: "shabana.parveen@poojamachines.co.in",
    title: "Auto fare for NCR warranty calls",
    description: "Six warranty calls across Gurugram and Faridabad over three days. Autos only.",
    category: "TRAVEL",
    amount: 1120,
    daysAgo: 52,
    status: "REIMBURSED",
    vendor: "Local autos",
    decisionNote: "Approved.",
  },
  {
    claimantEmail: "imran.khan@poojamachines.co.in",
    title: "Wire and MCBs for the fan-line testing panel",
    description:
      "The testing panel was tripping on earth leakage. Rewired it and replaced two MCBs. Material bought locally so the line was back the same shift.",
    category: "MATERIALS",
    amount: 2870,
    daysAgo: 58,
    status: "REIMBURSED",
    vendor: "Sector 63 Electricals",
    referenceNo: "SE-2210",
    decisionNote: "Approved. Good turnaround.",
  },
  {
    claimantEmail: "harpreet.singh@poojamachines.co.in",
    title: "Meals for the second-shift trial team",
    description:
      "Ran the second-shift trial on the fan line for three evenings and provided dinner for the eight people who stayed back. Output was up 9% — figures are in the production report.",
    category: "MEALS",
    amount: 3600,
    daysAgo: 63,
    status: "REIMBURSED",
    vendor: "Sharma Dhaba",
    decisionNote: "Approved.",
  },
  {
    claimantEmail: "gopal.nair@poojamachines.co.in",
    title: "Courier charges for statutory filings",
    description:
      "Sent the factory licence renewal papers and the fire-safety certificate to the Ludhiana office by courier, plus two dealer agreement sets.",
    category: "FREIGHT",
    amount: 780,
    daysAgo: 70,
    status: "REIMBURSED",
    vendor: "Blue Dart",
    referenceNo: "BD-77120043",
    decisionNote: "Approved.",
  },
  {
    claimantEmail: "pankaj.gupta@poojamachines.co.in",
    title: "Detention charges — Jalandhar vehicle",
    description:
      "The transporter's vehicle waited a day because the dealer's godown was closed for the festival. Paid the detention charge to release the vehicle.",
    category: "FREIGHT",
    amount: 1500,
    daysAgo: 76,
    status: "REIMBURSED",
    vendor: "Sethi Roadways",
    referenceNo: "SR-1190",
    decisionNote: "Approved this time. Please confirm the godown is open before dispatch.",
  },

  // --- Declined, with a note that says what to do -------------------------
  {
    claimantEmail: "vinod.meena@poojamachines.co.in",
    title: "Dinner during the second-shift trial",
    description:
      "Stayed back for the second-shift trial on the fan line for two evenings and had dinner outside both days.",
    category: "MEALS",
    amount: 940,
    daysAgo: 60,
    status: "REJECTED",
    vendor: "Sharma Dhaba",
    decisionNote:
      "Harpreet has already claimed the dinner for the whole trial team, including yours. Nothing more to pay on this one — but tell me if you were left out of that bill.",
    comments: [
      {
        fromAdmin: false,
        body: "Understood sir, I did not know it was already claimed. Please close this one.",
        daysAfter: 1,
      },
    ],
  },
  {
    claimantEmail: "manoj.patel@poojamachines.co.in",
    title: "Safety shoes",
    description: "Bought a new pair of safety shoes as the old ones had worn through at the sole.",
    category: "OTHER",
    amount: 1650,
    daysAgo: 41,
    status: "REJECTED",
    vendor: "Sardar Footwear",
    referenceNo: "SF-882",
    decisionNote:
      "Safety shoes are issued by stores against the annual PPE list, so there's no need to buy them yourself. Rekha will issue a pair this week; keep the bill in case your size isn't available.",
    comments: [
      {
        fromAdmin: false,
        body: "Sir, I had asked stores twice and was told the stock had finished, that is why I bought them.",
        daysAfter: 1,
      },
      {
        fromAdmin: true,
        body: "That's fair — I've spoken to Rekha. Since it was out of stock, please re-file it under Tools & spares and I'll pass it.",
        daysAfter: 2,
      },
    ],
  },

  // --- Withdrawn ----------------------------------------------------------
  {
    claimantEmail: "kavita.rani@poojamachines.co.in",
    title: "Auto fare to the Noida unit during the bus strike",
    description: "Took an auto for three days during the bus strike as there was no other way in.",
    category: "TRAVEL",
    amount: 540,
    daysAgo: 33,
    status: "CANCELLED",
  },

  // --- Drafts (private to their owner) ------------------------------------
  {
    claimantEmail: "neelam.singh@poojamachines.co.in",
    title: "Vernier calliper set for the testing bench",
    description:
      "One of the two vernier sets failed calibration this month. Getting a quotation before filing this properly — keeping it as a draft so I don't lose the bill.",
    category: "TOOLS",
    amount: 3850,
    daysAgo: 2,
    status: "DRAFT",
    vendor: "Punjab Tools Corner",
  },
  {
    claimantEmail: "arvind.jha@poojamachines.co.in",
    title: "Ludhiana and Phagwara trip — fuel",
    description:
      "Fuel for this week's dealer round. Will submit once I have the second pump receipt.",
    category: "FUEL",
    amount: 1980,
    daysAgo: 1,
    status: "DRAFT",
    vendor: "HP Petrol Pump",
  },
];

// ---------------------------------------------------------------------------
//  Tasks
// ---------------------------------------------------------------------------

export const TASK_CATEGORIES = [
  {
    name: "JK-2 Changeover",
    color: "indigo",
    description: "Retooling the sewing machine line for the revised JK-2 bed casting.",
  },
  {
    name: "Fan Line Capacity",
    color: "emerald",
    description: "Second-shift trial and throughput work on the Noida fan line.",
  },
  {
    name: "Quality & Compliance",
    color: "violet",
    description: "ISO documentation, calibration and the audit trail behind it.",
  },
  {
    name: "Plant Maintenance",
    color: "amber",
    description: "Preventive schedules, breakdowns and the tool room.",
  },
  {
    name: "Dealer Network",
    color: "teal",
    description: "Dealer visits, warranty calls and after-sales training.",
  },
  {
    name: "Admin & Statutory",
    color: "orange",
    description: "Filings, licences, payroll inputs and office running.",
  },
] as const;

export interface SeedTask {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "BLOCKED";
  category: string;
  /** Emails of the people it is assigned to. */
  assigneeEmails: string[];
  /** Days from today. Negative is in the past. */
  dueInDays: number | null;
  deadlineHour?: number;
  estimateHours?: number;
  progressPercent?: number;
  blockedReason?: string;
  tags?: string[];
  recurrence?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  recurrenceEvery?: number;
  /** Checklist items; `done` drives the derived progress. */
  checklist?: Array<{ label: string; done: boolean }>;
  /** Threaded updates. `fromAdmin` posts as the works manager. */
  updates?: Array<{
    authorEmail: string;
    body: string;
    daysAgo: number;
    progressPercent?: number;
    mentionEmails?: string[];
    replies?: Array<{ authorEmail: string; body: string; daysAgo: number }>;
  }>;
  /** Title of a task this one waits on. Resolved after all tasks exist. */
  waitsOn?: string;
}

/**
 * Tasks across every status, priority and view.
 *
 * Written so each screen has something real to show: overdue work for the red counts,
 * a blocked task with a reason worth reading, a dependency pair that proves the
 * completion guard, a recurring template, and threads that read like a shop floor
 * rather than lorem ipsum.
 */
export const TASKS: SeedTask[] = [
  // --- Overdue ------------------------------------------------------------
  {
    title: "Re-cut the feed-dog cam for the JK-2 batch",
    description:
      "The revised bed casting moves the feed-dog centre by 0.4 mm, so the existing cam sits proud and the stitch length drifts long at speed.\n\n**What is needed**\n\n- Re-cut to the revised drawing (Rev C, in the tool room folder)\n- Hold 0.02 mm on the lift profile\n- First-off approval from QA before the batch runs\n\nThe old cam is tagged and in the crib — do not scrap it until the new one is signed off.",
    priority: "CRITICAL",
    status: "IN_PROGRESS",
    category: "JK-2 Changeover",
    assigneeEmails: ["rajendra.tiwari@poojamachines.co.in"],
    dueInDays: -3,
    estimateHours: 6,
    tags: ["Production", "Quality", "Urgent"],
    checklist: [
      { label: "Pull Rev C drawing and confirm the datum", done: true },
      { label: "Rough-cut on the tool-room lathe", done: true },
      { label: "Grind the lift profile to 0.02 mm", done: false },
      { label: "First-off approval from QA", done: false },
    ],
    updates: [
      {
        authorEmail: "rajendra.tiwari@poojamachines.co.in",
        body: "Rough-cut is done. The surface grinder is still waiting on its spindle bearing, so I am finishing the lift profile on the cylindrical grinder instead — slower, but it will hold the tolerance.",
        daysAgo: 4,
        progressPercent: 40,
      },
      {
        authorEmail: "anil.gupta@poojamachines.co.in",
        body: "Understood. How long does the cylindrical route add? The line is waiting on this.",
        daysAgo: 3,
        mentionEmails: ["rajendra.tiwari@poojamachines.co.in"],
        replies: [
          {
            authorEmail: "rajendra.tiwari@poojamachines.co.in",
            body: "About a day and a half. I should have it with QA by Thursday morning.",
            daysAgo: 3,
          },
        ],
      },
      {
        authorEmail: "rajendra.tiwari@poojamachines.co.in",
        body: "Half the profile is ground. Holding 0.015 mm on the first side, which is inside tolerance.",
        daysAgo: 1,
        progressPercent: 55,
      },
    ],
  },
  {
    title: "Clear the 22 paint reworks from last week",
    description:
      "Twenty-two table-fan bodies were held for paint touch-up after the orange-peel finish on the second batch. Six were scrapped; the rest are salvageable.\n\nStrip, re-prime and re-coat. Check the gun pressure before starting — the last batch suggests it drifted.",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    category: "Fan Line Capacity",
    assigneeEmails: ["manoj.patel@poojamachines.co.in"],
    dueInDays: -1,
    estimateHours: 8,
    progressPercent: 70,
    tags: ["Production"],
    updates: [
      {
        authorEmail: "manoj.patel@poojamachines.co.in",
        body: "16 of 22 done. Gun pressure was low at 2.8 bar — reset to 3.5 and the finish is clean now. The remaining six are drying overnight.",
        daysAgo: 1,
        progressPercent: 70,
      },
    ],
  },

  // --- Blocked ------------------------------------------------------------
  {
    title: "Fit the replacement bearings on the fan motor batch",
    description:
      "140 motor housings are assembled and waiting on bearings. The consignment from the usual supplier was rejected by QA — 11 of 40 sampled were outside tolerance on the bore.\n\nOnce replacement stock lands, fit and run the 30-minute noise check on a 10% sample.",
    priority: "HIGH",
    status: "BLOCKED",
    category: "Fan Line Capacity",
    assigneeEmails: ["vinod.meena@poojamachines.co.in", "kavita.rani@poojamachines.co.in"],
    dueInDays: 2,
    estimateHours: 10,
    blockedReason:
      "Bearing consignment rejected by QA (11 of 40 outside tolerance). Replacement stock not yet confirmed by the supplier — Rekha is chasing.",
    tags: ["Production", "Blocked"],
    updates: [
      {
        authorEmail: "vinod.meena@poojamachines.co.in",
        body: "Housings are all assembled and stacked at the station. Nothing more we can do until the bearings arrive.",
        daysAgo: 2,
      },
      {
        authorEmail: "anil.gupta@poojamachines.co.in",
        body: "Rekha has the supplier on it. If nothing is confirmed by Friday we buy locally for this batch and take the cost — the Kanpur order cannot slip again.",
        daysAgo: 1,
        mentionEmails: ["rekha.verma@poojamachines.co.in"],
      },
    ],
  },

  // --- In review ----------------------------------------------------------
  {
    title: "Update the incoming inspection checklist for bearings",
    description:
      "After the rejected consignment, the incoming checklist needs a bore-tolerance check added with a defined sample size.\n\nDraft it, run it past Suresh, and put the revision into the ISO folder with a date and a revision number.",
    priority: "HIGH",
    status: "REVIEW",
    category: "Quality & Compliance",
    assigneeEmails: ["ashok.bind@poojamachines.co.in"],
    dueInDays: 1,
    estimateHours: 3,
    progressPercent: 90,
    tags: ["Quality", "Documentation"],
    updates: [
      {
        authorEmail: "ashok.bind@poojamachines.co.in",
        body: "Draft is done — sample size set at 10% or 5 pieces, whichever is greater, with a go/no-go plug gauge on the bore. Ready for Suresh to check.",
        daysAgo: 1,
        progressPercent: 90,
        mentionEmails: ["suresh.yadav@poojamachines.co.in"],
      },
    ],
  },
  {
    title: "Calibrate the vernier sets and the micrometer",
    description:
      "Monthly calibration of the three vernier sets and the bench micrometer. One vernier failed last month and is still tagged out.\n\nRecord readings in the calibration register and put the certificates in the ISO folder.",
    priority: "MEDIUM",
    status: "REVIEW",
    category: "Quality & Compliance",
    assigneeEmails: ["neelam.singh@poojamachines.co.in"],
    dueInDays: 3,
    estimateHours: 2,
    progressPercent: 90,
    tags: ["Quality"],
    recurrence: "MONTHLY",
    recurrenceEvery: 1,
  },

  // --- Due soon -----------------------------------------------------------
  {
    title: "Load and dispatch the Kanpur pedestal fan order",
    description:
      "90 pedestal fans for the Kanpur dealer, two-tier stacked. Heavier boxes are in — use those, not the standard ones.\n\nGenerate the e-way bill before the vehicle leaves and get the LR number onto the task.",
    priority: "HIGH",
    status: "TODO",
    category: "Dealer Network",
    assigneeEmails: ["pankaj.gupta@poojamachines.co.in", "sunita.kushwaha@poojamachines.co.in"],
    dueInDays: 1,
    deadlineHour: 16,
    estimateHours: 5,
    tags: ["Dispatch"],
    waitsOn: "Fit the replacement bearings on the fan motor batch",
    checklist: [
      { label: "Confirm the dealer godown is open", done: false },
      { label: "Pick and stage 90 units", done: false },
      { label: "Generate the e-way bill", done: false },
      { label: "Record the LR number", done: false },
    ],
  },
  {
    title: "Second-shift trial: week three figures",
    description:
      "Collate output, rejection rate and overtime for the third week of the fan line second-shift trial, and put a recommendation to Anil.\n\nWeeks one and two averaged 9% up on output with rejections flat. If week three holds, we make it permanent.",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    category: "Fan Line Capacity",
    assigneeEmails: ["harpreet.singh@poojamachines.co.in"],
    dueInDays: 2,
    estimateHours: 3,
    progressPercent: 45,
    tags: ["Production"],
    updates: [
      {
        authorEmail: "harpreet.singh@poojamachines.co.in",
        body: "Output is holding at +9%. Rejections are actually down slightly, 2.1% against 2.4% on days. Overtime cost is the open question — pulling the wage numbers from Gopal.",
        daysAgo: 1,
        progressPercent: 45,
        mentionEmails: ["gopal.nair@poojamachines.co.in"],
      },
    ],
  },
  {
    title: "Train the Gurugram dealer technicians on JK-2 timing",
    description:
      "Four technicians at Sharma Electricals need the hook timing adjustment for the revised JK-2. This is the third stitch-skipping complaint traced to a mis-set hook.\n\nTake the training jig and leave the one-page adjustment sheet with them.",
    priority: "MEDIUM",
    status: "TODO",
    category: "Dealer Network",
    assigneeEmails: ["shabana.parveen@poojamachines.co.in"],
    dueInDays: 4,
    estimateHours: 4,
    tags: ["Dealer Network"],
  },

  // --- Comfortably ahead --------------------------------------------------
  {
    title: "Preventive maintenance on all six presses",
    description:
      "Monthly preventive schedule: belts, guards, lubrication, emergency stops. Log each press in the maintenance register.\n\nPress 4's emergency stop was replaced last month — check it has bedded in.",
    priority: "MEDIUM",
    status: "TODO",
    category: "Plant Maintenance",
    assigneeEmails: ["mohan.prajapati@poojamachines.co.in", "imran.khan@poojamachines.co.in"],
    dueInDays: 9,
    estimateHours: 12,
    tags: ["Maintenance", "Safety"],
    recurrence: "MONTHLY",
    recurrenceEvery: 1,
    checklist: [
      { label: "Press 1 — belts, guards, lubrication", done: false },
      { label: "Press 2 — belts, guards, lubrication", done: false },
      { label: "Press 3 — belts, guards, lubrication", done: false },
      { label: "Press 4 — including the new e-stop", done: false },
      { label: "Press 5 — belts, guards, lubrication", done: false },
      { label: "Press 6 — belts, guards, lubrication", done: false },
    ],
  },
  {
    title: "File GSTR-1 for the month",
    description:
      "Match the outward register against the GST portal, resolve any mismatches with Deepak, file, and save the acknowledgement to the accounts folder.",
    priority: "HIGH",
    status: "TODO",
    category: "Admin & Statutory",
    assigneeEmails: ["gopal.nair@poojamachines.co.in"],
    dueInDays: 6,
    deadlineHour: 17,
    estimateHours: 4,
    tags: ["Documentation"],
    recurrence: "MONTHLY",
    recurrenceEvery: 1,
  },
  {
    title: "Turn 220 needle-bar shafts on VMC-2",
    description:
      "Batch of 220 for the JK-2 build. Hold 0.02 mm on the bearing diameter.\n\nVMC-2 was running warm last week — maintenance cleaned the coolant sensor. Watch it and stop if the spindle alarm returns.",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    category: "JK-2 Changeover",
    assigneeEmails: ["satish.dubey@poojamachines.co.in"],
    dueInDays: 5,
    estimateHours: 16,
    progressPercent: 30,
    tags: ["Production"],
    updates: [
      {
        authorEmail: "satish.dubey@poojamachines.co.in",
        body: "65 done, all within tolerance. Spindle temperature is normal since the sensor was cleaned. New carbide inserts are cutting well.",
        daysAgo: 2,
        progressPercent: 30,
      },
    ],
  },
  {
    title: "Rewire the fan-line testing panel",
    description:
      "The panel has tripped on earth leakage three times this month. Rewire it properly and replace the two suspect MCBs rather than resetting it again.\n\nLine has to be down for this — coordinate with Harpreet for a window.",
    priority: "HIGH",
    status: "COMPLETED",
    category: "Plant Maintenance",
    assigneeEmails: ["imran.khan@poojamachines.co.in"],
    dueInDays: -6,
    estimateHours: 5,
    tags: ["Maintenance", "Safety"],
    updates: [
      {
        authorEmail: "imran.khan@poojamachines.co.in",
        body: "Rewired and both MCBs replaced. Insulation resistance tested at 12 MΩ across all three phases. No trips in two days of running.",
        daysAgo: 5,
        progressPercent: 100,
      },
      {
        authorEmail: "anil.gupta@poojamachines.co.in",
        body: "Good — that one had been nagging for weeks. Thanks for doing it properly rather than resetting it again.",
        daysAgo: 5,
      },
    ],
  },
  {
    title: "Reconcile the fan motor stock count",
    description:
      "Physical count showed 22 motors short against the system. Trace it — most likely a mis-posting on the issue side rather than actual loss.",
    priority: "HIGH",
    status: "COMPLETED",
    category: "Admin & Statutory",
    assigneeEmails: ["rekha.verma@poojamachines.co.in"],
    dueInDays: -8,
    estimateHours: 4,
    tags: ["Dispatch", "Documentation"],
    updates: [
      {
        authorEmail: "rekha.verma@poojamachines.co.in",
        body: "Found it. A batch of 22 was issued to the assembly line on the 14th but posted against the wrong requisition number. Corrected the entry — no physical loss.",
        daysAgo: 7,
        progressPercent: 100,
      },
    ],
  },
  {
    title: "Publish the revised dealer price list",
    description:
      "Prices move from the first of next month. Update the list, get Anil to sign it off, and circulate to all 34 dealers.",
    priority: "MEDIUM",
    status: "COMPLETED",
    category: "Dealer Network",
    assigneeEmails: ["deepak.sharma@poojamachines.co.in"],
    dueInDays: -11,
    estimateHours: 3,
    tags: ["Dealer Network", "Documentation"],
  },
  {
    title: "Audit the fan blade balancing station",
    description:
      "Internal ISO audit of the balancing station: jig condition, operator method, records. Close any observations before the external audit next month.",
    priority: "MEDIUM",
    status: "COMPLETED",
    category: "Quality & Compliance",
    assigneeEmails: ["suresh.yadav@poojamachines.co.in"],
    dueInDays: -14,
    estimateHours: 5,
    tags: ["Quality", "Documentation"],
    updates: [
      {
        authorEmail: "suresh.yadav@poojamachines.co.in",
        body: "Two observations, both closed: the jig needed re-zeroing and the record sheet was missing the operator signature column. Sheet is revised and in the ISO folder.",
        daysAgo: 13,
        progressPercent: 100,
      },
    ],
  },
  {
    title: "Onboard Gopal — accounts access and PF number",
    description:
      "Attendance card, bank details, PF number, GST portal access and the accounts folder permissions.",
    priority: "LOW",
    status: "COMPLETED",
    category: "Admin & Statutory",
    assigneeEmails: ["anil.gupta@poojamachines.co.in"],
    dueInDays: -20,
    estimateHours: 2,
  },

  // --- Backlog ------------------------------------------------------------
  {
    title: "Sort the tool crib and tag items for regrinding",
    description:
      "The crib has drifted. Sort by type, tag anything blunt for regrinding, and write up what needs replacing rather than sharpening.",
    priority: "LOW",
    status: "TODO",
    category: "Plant Maintenance",
    assigneeEmails: ["rajendra.tiwari@poojamachines.co.in"],
    dueInDays: 18,
    estimateHours: 6,
    tags: ["Maintenance"],
  },
  {
    title: "Write the one-page JK-2 adjustment sheet for dealers",
    description:
      "The hook timing adjustment keeps coming back as a complaint. A single laminated page with the three measurements and a diagram would stop most of them.\n\nShabana can take it to dealers on her next round.",
    priority: "LOW",
    status: "TODO",
    category: "Dealer Network",
    assigneeEmails: ["suresh.yadav@poojamachines.co.in"],
    dueInDays: 22,
    estimateHours: 4,
    tags: ["Documentation", "Dealer Network"],
  },
  {
    title: "Daily production count — sewing machine line",
    description:
      "Record the day's head count, rejections and downtime against the shift target. Two minutes at the end of the shift.",
    priority: "LOW",
    status: "TODO",
    category: "JK-2 Changeover",
    assigneeEmails: ["ramesh.sahu@poojamachines.co.in"],
    dueInDays: 0,
    estimateHours: 0.25,
    tags: ["Production"],
    recurrence: "DAILY",
    recurrenceEvery: 1,
  },
  {
    title: "Weekly rejection summary for the quality board",
    description:
      "Rejection percentage by station for the week, with the top three causes and what was done about them.",
    priority: "MEDIUM",
    status: "TODO",
    category: "Quality & Compliance",
    assigneeEmails: ["neelam.singh@poojamachines.co.in"],
    dueInDays: 3,
    estimateHours: 1.5,
    tags: ["Quality"],
    recurrence: "WEEKLY",
    recurrenceEvery: 1,
  },
];

// ---------------------------------------------------------------------------
//  Customer orders
// ---------------------------------------------------------------------------

export interface SeedOrderStage {
  name: string;
  assigneeEmail: string;
  allottedDays: number;
  /** TODO | IN_PROGRESS | COMPLETED | BLOCKED */
  status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
  /** Working days ago the stage started. Null means it has not. */
  startedDaysAgo: number | null;
  /** Working days ago it finished. Null means it has not. */
  completedDaysAgo: number | null;
  progressPercent?: number;
  blockedReason?: string;
}

export interface SeedOrder {
  title: string;
  customerName: string;
  customerRef?: string;
  product?: string;
  quantity?: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Days from today. Negative is in the past. */
  promisedInDays: number;
  description?: string;
  stages: SeedOrderStage[];
  notes?: Array<{ authorEmail: string; body: string; daysAgo: number }>;
}

/**
 * Orders written to exercise every forecast state the engine can produce.
 *
 * ORD-0001 is the client's own example, made concrete: three stages of one day each
 * against a three-day promise, with the first person three days in. It is the order that
 * proves the forecast works, so it is the one the page opens on.
 */
export const ORDERS: SeedOrder[] = [
  {
    title: "150 domestic straight-stitch machines",
    customerName: "Ludhiana Sewing Centre",
    customerRef: "PO-4471",
    product: "JK-2 domestic",
    quantity: 150,
    priority: "CRITICAL",
    // Promised two days ago and still not out: already late, not merely forecast late.
    promisedInDays: -2,
    description:
      "Dealer has customers waiting. Two-tier stacking, heavier boxes. Their godown is closed Sundays.",
    stages: [
      {
        name: "Machine shop — bed castings and shafts",
        assigneeEmail: "satish.dubey@poojamachines.co.in",
        allottedDays: 1,
        status: "IN_PROGRESS",
        startedDaysAgo: 5,
        completedDaysAgo: null,
        progressPercent: 70,
      },
      {
        name: "Head assembly and timing",
        assigneeEmail: "ramesh.sahu@poojamachines.co.in",
        allottedDays: 1,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
      {
        name: "Final testing and boxing",
        assigneeEmail: "neelam.singh@poojamachines.co.in",
        allottedDays: 1,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
    ],
    notes: [
      {
        authorEmail: "anil.gupta@poojamachines.co.in",
        body: "Dealer rang again. Told him Thursday. Satish, what is holding the castings up?",
        daysAgo: 1,
      },
    ],
  },
  {
    title: "90 pedestal fans",
    customerName: "Kanpur Electricals",
    customerRef: "KE-8821",
    product: "Pedestal 400mm",
    quantity: 90,
    priority: "HIGH",
    /**
     * AT_RISK from the arithmetic alone — nothing is blocked here.
     *
     * Blade balancing was given 2 days and is 5 in, so the remaining work no longer fits
     * before the promise. This is the scenario the works manager described: one person
     * overruns, and the order is forecast late while the stages after it have not even
     * started.
     */
    promisedInDays: 4,
    stages: [
      {
        name: "Motor winding",
        assigneeEmail: "kavita.rani@poojamachines.co.in",
        allottedDays: 2,
        status: "COMPLETED",
        startedDaysAgo: 8,
        completedDaysAgo: 6,
      },
      {
        name: "Blade balancing and assembly",
        assigneeEmail: "vinod.meena@poojamachines.co.in",
        allottedDays: 2,
        status: "IN_PROGRESS",
        startedDaysAgo: 5,
        completedDaysAgo: null,
        progressPercent: 55,
      },
      {
        name: "Noise check and packing",
        assigneeEmail: "ashok.bind@poojamachines.co.in",
        allottedDays: 4,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
    ],
  },
  {
    title: "40 machines for the tailoring institute",
    customerName: "Karnal Tailoring Institute",
    customerRef: "KTI-2026-11",
    product: "JK-2 domestic",
    quantity: 40,
    priority: "MEDIUM",
    // Blocked stage, and the block is the reason it will slip.
    promisedInDays: 6,
    description: "Institute term starts on the 20th. They need all forty on the day.",
    stages: [
      {
        name: "Machine shop",
        assigneeEmail: "satish.dubey@poojamachines.co.in",
        allottedDays: 2,
        status: "COMPLETED",
        startedDaysAgo: 9,
        completedDaysAgo: 7,
      },
      {
        name: "Assembly",
        assigneeEmail: "ramesh.sahu@poojamachines.co.in",
        allottedDays: 3,
        status: "BLOCKED",
        startedDaysAgo: 4,
        completedDaysAgo: null,
        progressPercent: 30,
        blockedReason:
          "Bearing consignment rejected by QA — 11 of 40 outside tolerance. Replacement stock not confirmed.",
      },
      {
        name: "Final testing",
        assigneeEmail: "neelam.singh@poojamachines.co.in",
        allottedDays: 1,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
    ],
  },
  {
    title: "200 ceiling fans",
    customerName: "Sharma Electricals, Gurugram",
    customerRef: "SE-3390",
    product: "Ceiling 1200mm",
    quantity: 200,
    priority: "MEDIUM",
    // Comfortably on track — the page needs a healthy order on it too.
    promisedInDays: 12,
    stages: [
      {
        name: "Motor winding",
        assigneeEmail: "kavita.rani@poojamachines.co.in",
        allottedDays: 3,
        status: "COMPLETED",
        startedDaysAgo: 6,
        completedDaysAgo: 3,
      },
      {
        name: "Blade sets and balancing",
        assigneeEmail: "vinod.meena@poojamachines.co.in",
        allottedDays: 2,
        status: "IN_PROGRESS",
        startedDaysAgo: 1,
        completedDaysAgo: null,
        progressPercent: 40,
      },
      {
        name: "Testing and dispatch",
        assigneeEmail: "pankaj.gupta@poojamachines.co.in",
        allottedDays: 2,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
    ],
  },
  {
    title: "60 table fans",
    customerName: "Jalandhar Home Appliances",
    customerRef: "JHA-771",
    product: "Table 400mm",
    quantity: 60,
    priority: "LOW",
    // Not started at all — the PENDING case.
    promisedInDays: 18,
    stages: [
      {
        name: "Motor winding",
        assigneeEmail: "kavita.rani@poojamachines.co.in",
        allottedDays: 2,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
      {
        name: "Assembly and paint",
        assigneeEmail: "manoj.patel@poojamachines.co.in",
        allottedDays: 3,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
      {
        name: "Testing and packing",
        assigneeEmail: "ashok.bind@poojamachines.co.in",
        allottedDays: 1,
        status: "TODO",
        startedDaysAgo: null,
        completedDaysAgo: null,
      },
    ],
  },
  {
    title: "120 domestic machines",
    customerName: "Amritsar Sewing House",
    customerRef: "ASH-6612",
    product: "JK-2 domestic",
    quantity: 120,
    priority: "HIGH",
    // Delivered, and early — so the page has a completed order with a real record.
    promisedInDays: -4,
    stages: [
      {
        name: "Machine shop",
        assigneeEmail: "satish.dubey@poojamachines.co.in",
        allottedDays: 2,
        status: "COMPLETED",
        startedDaysAgo: 14,
        completedDaysAgo: 12,
      },
      {
        name: "Assembly",
        assigneeEmail: "ramesh.sahu@poojamachines.co.in",
        allottedDays: 2,
        status: "COMPLETED",
        startedDaysAgo: 11,
        completedDaysAgo: 9,
      },
      {
        name: "Testing and dispatch",
        assigneeEmail: "pankaj.gupta@poojamachines.co.in",
        allottedDays: 1,
        status: "COMPLETED",
        startedDaysAgo: 8,
        completedDaysAgo: 7,
      },
    ],
    notes: [
      {
        authorEmail: "pankaj.gupta@poojamachines.co.in",
        body: "Loaded and away on LR 88213. Dealer confirmed receipt.",
        daysAgo: 7,
      },
    ],
  },
];
