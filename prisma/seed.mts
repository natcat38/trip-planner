/**
 * Prisma schema and demo seed data: `schema.prisma` defines the Trip/Day/
 * Activity/Expense models, this script populates the public Fukuoka demo trip
 * for `npm run db:seed` (local Postgres container, or prod by pointing
 * DATABASE_URL at Neon) and prints its /shared/<token> link.
 * @packageDocumentation
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { requireEnv } from '../src/lib/env';

const adapter = new PrismaPg({ connectionString: requireEnv('DATABASE_URL') });
const db = new PrismaClient({ adapter });

// All costs are plain yen: JPY has no minor unit under ISO 4217, so
// minorUnitExponent('JPY') is 0 and *Minor fields hold whole yen.
//
// Mid-November: Kyushu's foliage peak, highs around 17-19C, well clear of both
// the cherry-blossom crowds and the summer heat.
const days = [
  {
    date: '2026-11-14',
    activities: [
      [
        'Land at Fukuoka Airport, subway to Hakata',
        'Fukuoka Airport',
        33.5859,
        130.4507,
        '14:20',
        'Transport',
        260,
      ],
      [
        'Kushida Shrine and the Hakata old town lanes',
        'Kushida Shrine',
        33.5936,
        130.4106,
        '16:00',
        'Sightseeing',
        0,
      ],
      [
        'Tonkotsu ramen at the Nakasu yatai stalls',
        'Nakasu Yatai',
        33.5936,
        130.4045,
        '19:30',
        'Food',
        2400,
      ],
    ],
  },
  {
    date: '2026-11-15',
    activities: [
      [
        'Dazaifu Tenmangu shrine approach',
        'Dazaifu Tenmangu',
        33.5215,
        130.5347,
        '09:30',
        'Sightseeing',
        1000,
      ],
      [
        'Komyozenji moss and maple garden',
        'Komyozenji',
        33.5185,
        130.5342,
        '12:00',
        'Sightseeing',
        500,
      ],
      [
        'Kyushu National Museum',
        'Kyushu National Museum',
        33.5195,
        130.5395,
        '14:00',
        'Sightseeing',
        700,
      ],
    ],
  },
  {
    date: '2026-11-16',
    activities: [
      [
        'Nanzoin reclining Buddha',
        'Nanzoin',
        33.6183,
        130.5322,
        '09:00',
        'Sightseeing',
        500,
      ],
      [
        'Akizuki castle town, maple tunnel',
        'Akizuki',
        33.4392,
        130.6461,
        '13:00',
        'Sightseeing',
        0,
      ],
      [
        'Kaiseki dinner back in Hakata',
        'Hakata Station',
        33.5897,
        130.4207,
        '19:00',
        'Food',
        6500,
      ],
    ],
  },
  {
    date: '2026-11-17',
    activities: [
      [
        'Ohori Park loop and teahouse',
        'Ohori Park',
        33.586,
        130.3789,
        '10:00',
        'Sightseeing',
        250,
      ],
      [
        'Fukuoka Castle ruins and Fukuoka Art Museum',
        'Maizuru Park',
        33.5847,
        130.3833,
        '13:00',
        'Sightseeing',
        200,
      ],
      [
        'Sunset from Fukuoka Tower, Momochi beach',
        'Fukuoka Tower',
        33.5933,
        130.3514,
        '16:30',
        'Sightseeing',
        800,
      ],
    ],
  },
  {
    date: '2026-11-18',
    activities: [
      [
        'Drive the Itoshima coast road',
        'Sakurai Futamigaura',
        33.6314,
        130.1963,
        '09:30',
        'Transport',
        7000,
      ],
      [
        'Shiraito Falls and the valley walk',
        'Shiraito Falls',
        33.4739,
        130.1786,
        '12:30',
        'Sightseeing',
        0,
      ],
      [
        'Seafood lunch at a coastal cafe',
        'Itoshima',
        33.5561,
        130.1958,
        '14:30',
        'Food',
        3200,
      ],
    ],
  },
  {
    date: '2026-11-19',
    activities: [
      [
        'Yanagawa canal punting',
        'Yanagawa',
        33.1631,
        130.4067,
        '10:30',
        'Sightseeing',
        2100,
      ],
      [
        'Unagi seiro-mushi, the Yanagawa speciality',
        'Yanagawa',
        33.1638,
        130.4083,
        '13:00',
        'Food',
        3800,
      ],
      [
        'Yame tea tasting on the way back',
        'Yame',
        33.2103,
        130.5586,
        '15:30',
        'Food',
        1200,
      ],
    ],
  },
  {
    date: '2026-11-20',
    activities: [
      [
        'Yufuin no Mori train through the mountains',
        'Yufuin Station',
        33.2645,
        131.3572,
        '08:20',
        'Transport',
        5690,
      ],
      [
        'Kinrinko lake and the Yunotsubo shopping street',
        'Kinrinko',
        33.2664,
        131.3706,
        '11:30',
        'Sightseeing',
        0,
      ],
      [
        'Onsen ryokan overnight',
        'Yufuin',
        33.2632,
        131.3629,
        '16:00',
        'Lodging',
        24000,
      ],
    ],
  },
  {
    date: '2026-11-21',
    activities: [
      [
        'Kokura Castle and its autumn garden',
        'Kokura Castle',
        33.8858,
        130.8739,
        '11:00',
        'Sightseeing',
        350,
      ],
      [
        'Tanga Market lunch crawl',
        'Tanga Market',
        33.8848,
        130.8804,
        '13:00',
        'Food',
        2000,
      ],
      [
        'Mojiko Retro waterfront at dusk',
        'Mojiko Retro',
        33.9464,
        130.9631,
        '16:00',
        'Sightseeing',
        0,
      ],
    ],
  },
  {
    date: '2026-11-22',
    activities: [
      [
        'Raizan Sennyoji, the 400-year-old maple',
        'Raizan Sennyoji',
        33.4703,
        130.2119,
        '09:30',
        'Sightseeing',
        400,
      ],
      [
        'Tenjin and Daimyo browsing',
        'Tenjin',
        33.5902,
        130.3986,
        '14:00',
        'Other',
        0,
      ],
      [
        'Motsunabe hotpot dinner',
        'Tenjin',
        33.5896,
        130.3969,
        '19:00',
        'Food',
        4200,
      ],
    ],
  },
  {
    date: '2026-11-23',
    activities: [
      [
        'Tochoji temple and the great seated Buddha',
        'Tochoji',
        33.5941,
        130.4144,
        '09:00',
        'Sightseeing',
        0,
      ],
      [
        'Mentaiko and Hakata dolls at Hakata Station',
        'Hakata Station',
        33.5897,
        130.4207,
        '11:00',
        'Other',
        5000,
      ],
      [
        'Subway to Fukuoka Airport, fly home',
        'Fukuoka Airport',
        33.5859,
        130.4507,
        '13:30',
        'Transport',
        260,
      ],
    ],
  },
] as const;

const user = await db.user.upsert({
  where: { email: 'demo@example.com' },
  update: {},
  create: { email: 'demo@example.com', name: 'Demo Traveller' },
});

// Idempotent re-seed. Scoped to the demo user, so real accounts' trips are
// untouched; days/activities/expenses go with it via the schema's cascades.
await db.trip.deleteMany({ where: { userId: user.id } });

const trip = await db.trip.create({
  data: {
    userId: user.id,
    name: 'Fukuoka in Autumn',
    destinations: ['Fukuoka', 'Dazaifu', 'Itoshima', 'Yufuin', 'Kitakyushu'],
    startDate: new Date('2026-11-14'),
    endDate: new Date('2026-11-23'),
    baseCurrency: 'JPY',
    budgetMinor: 450_000,
    shareToken: randomBytes(24).toString('base64url'),
    days: {
      create: days.map(({ date, activities }) => ({
        date: new Date(date),
        activities: {
          create: activities.map(
            (
              [title, placeName, lat, lng, startTime, category, cost],
              sortOrder,
            ) => ({
              title,
              placeName,
              lat,
              lng,
              startTime,
              category,
              sortOrder,
              costMinor: cost,
              costCurrency: 'JPY',
            }),
          ),
        },
      })),
    },
    expenses: {
      create: [
        {
          label: 'Return flights',
          category: 'Transport',
          costMinor: 96_000,
          costCurrency: 'JPY',
        },
        {
          label: 'Hakata hotel, 9 nights',
          category: 'Lodging',
          costMinor: 112_500,
          costCurrency: 'JPY',
        },
        {
          label: 'Travel insurance',
          category: 'Other',
          costMinor: 8_400,
          costCurrency: 'JPY',
        },
      ],
    },
  },
});

console.log(`Seeded trip "${trip.name}" (${trip.id}) for ${user.email}`);
console.log(`Share link: /shared/${trip.shareToken}`);
await db.$disconnect();
