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
