import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { requireEnv } from '../src/lib/env';

const adapter = new PrismaPg({ connectionString: requireEnv('DATABASE_URL') });
const db = new PrismaClient({ adapter });

const user = await db.user.upsert({
  where: { email: 'demo@example.com' },
  update: {},
  create: { email: 'demo@example.com' },
});

const trip = await db.trip.create({
  data: {
    userId: user.id,
    name: 'Japan Trip',
    destinations: ['Tokyo', 'Kyoto'],
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-03'),
    baseCurrency: 'JPY',
    budgetMinor: 35000000, // ¥350,000
    days: {
      create: [
        {
          date: new Date('2026-09-01'),
          activities: {
            create: [
              {
                title: 'Check in to hotel',
                category: 'Lodging',
                sortOrder: 0,
                costMinor: 6930000,
                costCurrency: 'JPY',
              },
              {
                title: 'Dinner in Shinjuku',
                category: 'Food',
                sortOrder: 1,
                costMinor: 990000,
                costCurrency: 'JPY',
              },
            ],
          },
        },
      ],
    },
    expenses: {
      create: [
        {
          label: 'Flights',
          category: 'Transport',
          costMinor: 12000000,
          costCurrency: 'JPY',
        },
      ],
    },
  },
});

console.log(`Seeded trip "${trip.name}" (${trip.id}) for ${user.email}`);
await db.$disconnect();
