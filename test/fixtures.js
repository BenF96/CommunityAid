// Sample data used only by the automated tests (never loaded into the real database)
const Resource = require('../models/Resource');
const AidRequest = require('../models/AidRequest');

const daysAgo = (d, h = 10) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, 0, 0, 0);
  return t;
};

async function loadFixtures() {
  await Promise.all([Resource.deleteMany({}), AidRequest.deleteMany({})]);

  const [foodBank, meals, pantry, rent, utility, emergency] = await Resource.create([
    {
      name: 'Eastside Community Food Bank', category: 'food', type: 'Food Bank',
      description: 'Free groceries including fresh produce, dairy, bread and canned goods. Volunteers help carry items to your car.',
      address: '120 Market St', serviceArea: 'Eastside & Downtown', phone: '555-0101', email: 'info@eastsidefood.example.org',
      website: 'https://eastsidefood.example.org', hours: 'Mon, Wed, Fri 10am–4pm',
      eligibility: 'Open to all residents. Bring ID or a recent bill if available; nobody is turned away.',
    },
    {
      name: 'St. Anne Hot Meals Program', category: 'food', type: 'Meal Program',
      description: 'Free hot lunch served daily in the parish hall. Take-away boxes available.',
      address: '45 Church Rd', serviceArea: 'All areas', phone: '555-0144', hours: 'Daily 12pm–2pm',
      eligibility: 'Everyone welcome, no questions asked.',
    },
    {
      name: 'Northgate Family Pantry', category: 'food', type: 'Food Pantry',
      description: 'Weekly pantry boxes for families with children, including baby formula and diapers on request.',
      address: '8 Northgate Ave', serviceArea: 'Northgate', phone: '555-0122', hours: 'Sat 9am–1pm',
      eligibility: 'Families with children under 18.',
    },
    {
      name: 'Neighbourhood Rent Relief Fund', category: 'financial', type: 'Rent Assistance',
      description: 'One-time grants paid directly to landlords to help families avoid eviction.',
      address: '9 Civic Plaza, Room 204', serviceArea: 'City-wide', phone: '555-0170', email: 'rent@example.org',
      hours: 'Mon–Fri 9am–5pm',
      eligibility: 'Household income below 60% of area median; eviction notice or overdue rent statement required.',
    },
    {
      name: 'Utility Bill Assistance', category: 'financial', type: 'Utility Help',
      description: 'Help paying overdue electricity, water and heating bills.',
      phone: '555-0199', email: 'utility@example.org', serviceArea: 'City-wide', hours: 'Tue–Thu 10am–3pm',
      eligibility: 'Disconnection notice required.',
    },
    {
      name: 'Emergency Hardship Grant', category: 'financial', type: 'Emergency Cash Grant',
      description: 'Small emergency grants for urgent costs such as medicine, transport to work, or school supplies.',
      address: '9 Civic Plaza, Room 210', phone: '555-0177', hours: 'By appointment', isActive: false,
      eligibility: 'Currently paused while funding is renewed.',
    },
  ]);

  const requests = [
    {
      fullName: 'Maria Lopez', phone: '555-1234', aidType: 'food', householdSize: 4, urgency: 3,
      description: 'Lost my job last month and need groceries for my family this week.',
      status: 'in-progress', assignedResource: foodBank._id, notes: 'Volunteer scheduled pickup for Friday.',
      createdAt: daysAgo(3),
      history: [
        { at: daysAgo(3), action: 'created', detail: 'Request submitted for food aid' },
        { at: daysAgo(2), action: 'assigned', detail: `Assigned to ${foodBank.name}` },
        { at: daysAgo(2, 11), action: 'status', detail: 'Status changed from Pending to In progress' },
      ],
    },
    {
      fullName: 'James Carter', email: 'jcarter@example.com', aidType: 'financial', householdSize: 2,
      amountNeeded: 650, urgency: 3, createdAt: daysAgo(1),
      description: 'Behind on rent after medical bills. Received a late notice with a 10-day deadline.',
    },
    {
      fullName: 'Aisha Khan', phone: '555-5678', aidType: 'financial', householdSize: 3, amountNeeded: 180,
      urgency: 2, status: 'fulfilled', assignedResource: utility._id, createdAt: daysAgo(12), fulfilledAt: daysAgo(8),
      description: 'Electricity bill overdue, disconnection scheduled next week.',
      notes: 'Payment of ₱180 sent to utility company.',
      history: [
        { at: daysAgo(12), action: 'created', detail: 'Request submitted for financial aid' },
        { at: daysAgo(11), action: 'assigned', detail: `Assigned to ${utility.name}` },
        { at: daysAgo(11, 12), action: 'status', detail: 'Status changed from Pending to In progress' },
        { at: daysAgo(8), action: 'status', detail: 'Status changed from In progress to Fulfilled' },
      ],
    },
    {
      fullName: 'Tom Nguyen', phone: '555-2468', aidType: 'food', householdSize: 1, urgency: 1, createdAt: daysAgo(5),
      description: 'Senior on fixed income, would appreciate a weekly meal option.',
    },
    {
      fullName: 'Grace Okafor', phone: '555-8642', email: 'grace.o@example.com', aidType: 'food', householdSize: 6,
      urgency: 2, status: 'fulfilled', assignedResource: pantry._id, createdAt: daysAgo(10), fulfilledAt: daysAgo(6),
      description: 'Large family, need pantry items and baby formula.',
      notes: 'Pantry box plus formula collected Saturday.',
      history: [
        { at: daysAgo(10), action: 'created', detail: 'Request submitted for food aid' },
        { at: daysAgo(9), action: 'assigned', detail: `Assigned to ${pantry.name}` },
        { at: daysAgo(6), action: 'status', detail: 'Status changed from Pending to Fulfilled' },
      ],
    },
    {
      fullName: 'Daniel Reyes', phone: '555-1357', aidType: 'financial', householdSize: 4, amountNeeded: 1200,
      urgency: 3, status: 'in-progress', assignedResource: rent._id, createdAt: daysAgo(4),
      description: 'Eviction notice received. Need help covering two months of rent.',
      notes: 'Application sent to the rent relief fund; awaiting landlord confirmation.',
      history: [
        { at: daysAgo(4), action: 'created', detail: 'Request submitted for financial aid' },
        { at: daysAgo(3), action: 'assigned', detail: `Assigned to ${rent.name}` },
        { at: daysAgo(3, 12), action: 'status', detail: 'Status changed from Pending to In progress' },
      ],
    },
    {
      fullName: 'Fatima Hassan', email: 'fhassan@example.com', aidType: 'food', householdSize: 3, urgency: 2,
      createdAt: daysAgo(0, 8),
      description: 'Reduced work hours this month; running low on groceries.',
    },
    {
      fullName: 'Peter Mwangi', phone: '555-9753', aidType: 'food', householdSize: 2, urgency: 1,
      status: 'fulfilled', assignedResource: meals._id, createdAt: daysAgo(13), fulfilledAt: daysAgo(12),
      description: 'Needed hot meals while recovering from surgery.',
      history: [
        { at: daysAgo(13), action: 'created', detail: 'Request submitted for food aid' },
        { at: daysAgo(13, 14), action: 'assigned', detail: `Assigned to ${meals.name}` },
        { at: daysAgo(12), action: 'status', detail: 'Status changed from Pending to Fulfilled' },
      ],
    },
    {
      fullName: 'Linda Park', phone: '555-3141', aidType: 'financial', householdSize: 1, amountNeeded: 95,
      urgency: 2, createdAt: daysAgo(6),
      description: 'Water bill overdue after an unexpected leak.',
    },
    {
      fullName: 'Samuel Adeyemi', phone: '555-2718', aidType: 'financial', householdSize: 5, amountNeeded: 400,
      urgency: 2, status: 'fulfilled', assignedResource: rent._id, createdAt: daysAgo(9), fulfilledAt: daysAgo(4),
      description: 'Short on rent after car repair costs.',
      history: [
        { at: daysAgo(9), action: 'created', detail: 'Request submitted for financial aid' },
        { at: daysAgo(8), action: 'assigned', detail: `Assigned to ${rent.name}` },
        { at: daysAgo(4), action: 'status', detail: 'Status changed from Pending to Fulfilled' },
      ],
    },
  ];
  await AidRequest.create(requests);
}

module.exports = loadFixtures;
