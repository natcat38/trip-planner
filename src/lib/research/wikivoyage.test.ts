import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetGuideCacheForTests,
  getGuide,
  stripWikitext,
} from './wikivoyage';

type MockResponse = { ok?: boolean; body?: unknown };

// Dispatches the mocked fetch based on the Wikivoyage API params actually
// used by wikivoyage.ts (action=query for search, action=parse for the
// section index and per-section wikitext), mirroring fx.test.ts's stubbed
// global fetch but branching per endpoint since getGuide chains several
// calls.
function mockWikivoyage(responses: {
  search?: MockResponse | 'throw';
  sections?: MockResponse;
  wikitext?: (sectionIndex: string) => MockResponse;
}) {
  const fetchMock = vi.fn(async (url: string) => {
    const parsed = new URL(url);
    const action = parsed.searchParams.get('action');

    if (action === 'query') {
      if (responses.search === 'throw') throw new Error('network error');
      const { ok = true, body = {} } = responses.search ?? {};
      return { ok, json: () => Promise.resolve(body) };
    }

    if (action === 'parse') {
      const prop = parsed.searchParams.get('prop');
      if (prop === 'sections') {
        const { ok = true, body = {} } = responses.sections ?? {};
        return { ok, json: () => Promise.resolve(body) };
      }
      if (prop === 'wikitext') {
        const sectionIndex = parsed.searchParams.get('section') ?? '';
        const { ok = true, body = {} } =
          responses.wikitext?.(sectionIndex) ?? {};
        return { ok, json: () => Promise.resolve(body) };
      }
    }

    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function searchHit(title: string): MockResponse {
  return { body: { query: { search: [{ title }] } } };
}

function sectionsBody(sections: unknown): MockResponse {
  return { body: { parse: { sections } } };
}

function wikitextBody(text: string): MockResponse {
  return { body: { parse: { wikitext: { '*': text } } } };
}

// --- Fixtures below are real Wikivoyage wikitext, fetched live from
// https://en.wikivoyage.org/w/api.php (action=parse, prop=wikitext) on
// 2026-08-20 and trimmed. They are NOT re-fetched in tests — see
// mockWikivoyage above. Trimming points: Fukuoka See stops before the
// "Views" subsection; Eat stops after the "Nagahama"/"Daimyo" listings
// (before "Ichiran"); Get around stops before "By foot". Yubari's three
// sections are pasted whole — they're already this short on the live page,
// which is the whole point of the fixture (see §3.2 of the handoff doc).

const FUKUOKA_SEE_WIKITEXT =
  "==See==\n{{Mapframe|33.59486|130.38092|zoom=13}}\n{{Mapshapes|Q289242}}\n* {{see\n| name=Nakasu | alt= | url= | email=\n| address= | lat=33.593249 | long=130.405667 | directions=\n| phone= | tollfree= | fax=\n| hours= | price=\n| image=Fukuoka Bike.jpg\n| lastedit=2016-03-15\n| content=This area is next to Tenjin and is Fukuoka's red-light district, with over 3500 restaurants, as well as ramen stalls (yatai), shopping, pubs, hostess bars, rooftop beer gardens in summer, one surviving movie theater, and sex trade. The neon lights on the Naka River are famous with over 60,000 visitors a day, and it has the busiest street in Kyushu.\n}}\n* {{see\n| name=Gion | alt= | url= | email=\n| address= | lat=33.593807 | long=130.413587 | directions=\n| phone= | tollfree= | fax=\n| hours= | price=\n| image=Entrance No.3 of Gion Station (Fukuoka Municipal Subway).jpg\n| lastedit=2016-03-15\n| content=This area has several historical shrines and Buddhist temples, including:\n}}\n** {{see\n| name=Kushida Shrine | alt= | url= | email=\n| address= | lat=33.592972 | long=130.410472 | directions=\n| phone= | tollfree=\n| hours= | price=\n| wikipedia=Kushida Shrine | wikidata=Q865839\n| content=The 8th-century Kushida Shrine is starting point for the annual Gion-Yamakasa Festival.\n}}\n** {{see\n| name=Tōchō-ji | alt= | url= | email=\n| address= | lat=33.595 | long=130.414167 | directions=\n| phone= | tollfree=\n| hours= | price=Free entry; ¥100 to see the Buddha\n| wikipedia=Tōchō-ji | wikidata=Q3547067\n| content=It has a 10.8-m wooden Great Buddha.\n| lastedit=2026-05-06\n}}\n** {{see\n| name=Shōfuku-ji | alt= | url= | email=\n| address= | lat=33.597454 | long=130.414458 | directions=\n| phone= | tollfree=\n| hours= | price=\n| wikipedia=Shōfuku-ji (Fukuoka) | wikidata=Q657825\n| content=Japan's first Zen temple.\n}}";

const FUKUOKA_EAT_WIKITEXT =
  "==Eat==\n[[File:Hakatara-men.jpg|thumb|Hakata tonkotsu ramen]]\n\nHakata is famous for its style of '''ramen''', known as ''tonkotsu'' (豚骨, lit. \"pork bone\") ramen, which has a very pungent smell thanks to the thick broth that is made from simmering pork ribs for at least 12 hours (up to 3 days at some of the best restaurants), and is one of [[Japan's Top 3#Ramen|Japan's top three ramen]]. Enjoy it with pickled ginger and lots of sesame seeds. Save the broth, because you can order a refill of noodles (''kaedama'') for around ¥300 at many places.\n\nAlthough there are restaurants all over town serving ramen at various price levels, some of the best joints are '''''yatai''''', mobile food stalls (see also the Drink section). The stalls are set up early evening and can be found on major streets; particularly in Tenjin (near the post office), Nakasu and Nagahama-Dori. Also, along the river from Canal City, an entire strip of yatai can be found. Although ramen is the norm, you can find anything from yakitori to Italian cuisine. Brush up on your Japanese or pointing skills as these guys don't speak English at all. ''A few tips: respect other customers' space, don't go in large groups (split up and use multiple stalls), and don't stay too long.''\n\nAnother regional product Hakata is famous for is the spicy '''''mentaiko''''' (明太子), or '''pollock roe''' condiment, though in actuality these days it is all imported. Enjoy it plain with breakfast, inside an ''onigiri'', or tossed with spaghetti. It's widely available for tourists in JR Hakata Station as well as major department stores, although it needs to be refrigerated.\n\nFukuoka is also known for having good ''gyoza'' (pork dumplings) and there are many places to try some. (They are a perfect appetizer/side dish for ramen, incidentally.)\n\nLunch time is probably the best value for the money. Most restaurants will do lunch sets at 1/2 or 1/3 the price of their dinner sets, but serve the same course. If you have a bit more cash to spend and want to have a nice Japanese style lunch, the Grand Hyatt at Canal City and the Excel Hotel near Nakasu are both good. Most of the larger, nicer hotels in the area will serve beautiful lunch sets. Many restaurants and cafes in the area will have lunch sets under ¥1,000.\n\n* {{eat\n| name=Nagahama | alt= | url= | email=\n| address= | lat=33.593501 | long=130.393346 | directions=northwest of Oyafuko St\n| phone= | tollfree=\n| hours= | price=\n| lastedit=2016-03-15\n| content=Famous for Hakata's Nagahama ramen, with stalls (yatai) that get set up daily to handle the locals who are proud of their ramen. You will most likely smell it before you see it, and if you want a true Fukuoka experience is definitely worth a look if not a full meal.\n}}\n* {{eat\n| name=Daimyo | alt= | url= | email=\n| address= | lat= | long= | directions=\n| phone= | tollfree=\n| hours= | price=\n| wikipedia= | wikidata=\n| lastedit=\n| content=A few places offer Happy Hour from 17:00-19:00, if you are looking for some refreshment before dinner.\n}}";

const FUKUOKA_GET_AROUND_WIKITEXT =
  "==Get around==\n{{infobox|Bullet train on the cheap|Want to try out the bullet train, but put off by those high fares?  Ride the '''Hakata Minami Line''' (博多南線) from Hakata Station.  Built to connect to the train depot, the 8½-km, 10-min ride uses Shinkansen equipment and costs all of ¥290.}}\n\n===By public transport===\nThe '''[https://subway.city.fukuoka.lg.jp/eng/index.php Fukuoka City Subway]''' consists of 3 lines. The Hakata subway station, located under the JR Hakata Station, can take passengers straight to [https://www.fukuoka-airport.jp/en/ Fukuoka International Airport] (6 min, ¥260), to Tenjin, the city's ''de facto'' downtown district, and to other major stops. An all-day subway pass (''ichinichi joshaken'') costs ¥640. If you tap a contactless credit card as you enter and leave subway stations, you will be charged no more than the cost of an all-day pass per day. Regular tickets cost between ¥210 and ¥380 depending on distance. The local rechargeable contactless smart card is called '''''[https://subway.city.fukuoka.lg.jp/eng/fare/one/#no02 Hayakaken]''''' and is compatible with other smart cards like PASMO ([[Tokyo]]) and ICOCA ([[Kyoto]] and [[Osaka]]). IC cards are also generally accepted on buses by multiple companies; some also accept contactless credit cards and QR code payments. When using a bus with an IC card reader or contactless credit card, be sure to tap when you enter ''and'' as you leave, so that you are charged the correct fare.\n\nContactless credit card payment (Visa, Mastercard, JCB, Amex, Diners, Discover) is available at all ticket gates on all subway lines. You can enter and exit by simply tapping your credit card or smartphone.\n\nThere is a [https://yokanavi.com/en/tourist-city-pass/ special pass for overseas tourists] which costs ¥2500 (¥1250 child) for one-day unlimited rides on buses, trains and subways, with some discounts at sights.\n\nFukuoka is well served by '''[http://www.nishitetsu.co.jp/ Nishitetsu buses]'''. Fares vary based on distance traveled, starting at ¥150 (Oct 2025).";

const YUBARI_SEE_WIKITEXT =
  '==See==\n* {{see\n| name=Yubari Coal Mine Museum | alt=夕張市石炭博物館 | url=https://coal-yubari.jp/index.php | email=\n| address=7‐1 Takamatsu | lat=43.068389 | long=141.989167 | directions=\n| phone=+81 123 52 5500 | tollfree=\n| hours= | price=\n| wikidata=Q11430194\n| lastedit=2022-03-14\n| content=\n}}';

const YUBARI_EAT_WIKITEXT =
  '==Eat==\n* {{eat\n| name=Yubari Yatai Village | alt=ゆうばり屋台村（バリー屋台） | url= | email=\n| address=1 Chome-81 Suehiro | lat=43.05086 | long=141.96716 | directions=Across from the old JR Yubari station\n| phone=+81 123 52 0230 | tollfree=\n| hours= | price=\n| lastedit=2022-03-14\n| content=Small food court with a couple of restaurants.\n}}\n* {{eat\n| name=Orenchi | alt=俺家 | url= | email=\n| address=3 Chome-71 Honcho | lat=43.058353 | long=141.977298 | directions=\n| phone=+81 123-52-2670 | tollfree=\n| hours=M-Sa 17:30-23:00; Su 17:30-21:00 | price=\n| lastedit=2022-04-02\n| content=Izakaya restaurant.\n}}\n* {{eat\n| name=Nonkiya | alt=のんきや | url= | email=\n| address=1 Chome-52 Honcho | lat=43.05974 | long=141.97752 | directions=Walk 15 mins north from old Yubari train station\n| phone= | tollfree=\n| hours=F-W 11:30-14:30 | price=¥600 (as of 2018)\n| lastedit=2022-04-02\n| content=Ramen restaurant.\n}}';

// Yubari's Get around section, verified live: it is genuinely just the
// heading with no body at all (§3.2 of the handoff doc).
const YUBARI_GET_AROUND_WIKITEXT = '==Get around==';

const FUKUOKA_SECTIONS = [
  { toclevel: 1, line: 'Get around', index: '9' },
  { toclevel: 1, line: 'See', index: '16' },
  { toclevel: 1, line: 'Eat', index: '26' },
];

const FUKUOKA_WIKITEXT: Record<string, string> = {
  '9': FUKUOKA_GET_AROUND_WIKITEXT,
  '16': FUKUOKA_SEE_WIKITEXT,
  '26': FUKUOKA_EAT_WIKITEXT,
};

const YUBARI_SECTIONS = [
  { toclevel: 1, line: 'Get around', index: '4' },
  { toclevel: 1, line: 'See', index: '5' },
  { toclevel: 1, line: 'Eat', index: '8' },
];

const YUBARI_WIKITEXT: Record<string, string> = {
  '4': YUBARI_GET_AROUND_WIKITEXT,
  '5': YUBARI_SEE_WIKITEXT,
  '8': YUBARI_EAT_WIKITEXT,
};

beforeEach(() => {
  __resetGuideCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getGuide', () => {
  it('chains search -> section index -> section wikitext into parsed sections', async () => {
    mockWikivoyage({
      search: searchHit('Fukuoka'),
      sections: sectionsBody(FUKUOKA_SECTIONS),
      wikitext: (idx) => wikitextBody(FUKUOKA_WIKITEXT[idx]),
    });

    const guide = await getGuide('Fukuoka');

    expect(guide?.title).toBe('Fukuoka');
    expect(guide?.url).toContain('Fukuoka');
    expect(guide?.sections.getAround).toContain('¥640');
    expect(guide?.sections.eat).toContain('¥300');
    // The listing price survives verbatim, per the coordinator's bug report.
    expect(guide?.sections.see).toContain('Free entry; ¥100 to see the Buddha');
    // Headings not present in the mocked section index stay null.
    expect(guide?.sections.do).toBeNull();
    expect(guide?.sections.getIn).toBeNull();
  });

  it('returns coverage "good" for a Fukuoka-sized guide', async () => {
    mockWikivoyage({
      search: searchHit('Fukuoka'),
      sections: sectionsBody(FUKUOKA_SECTIONS),
      wikitext: (idx) => wikitextBody(FUKUOKA_WIKITEXT[idx]),
    });

    const guide = await getGuide('Fukuoka');
    expect(guide?.coverage).toBe('good');
  });

  it('returns coverage "thin" for a Yubari-sized guide with an empty Get around section', async () => {
    mockWikivoyage({
      search: searchHit('Yubari'),
      sections: sectionsBody(YUBARI_SECTIONS),
      wikitext: (idx) => wikitextBody(YUBARI_WIKITEXT[idx]),
    });

    const guide = await getGuide('Yubari');
    expect(guide?.coverage).toBe('thin');
    expect(guide?.sections.getAround).toBeNull();
    expect(guide?.sections.see).toContain('Yubari Coal Mine Museum');
    expect(guide?.sections.eat).toContain('¥600');
  });

  it('returns coverage "none" when the search has no hit, without throwing', async () => {
    mockWikivoyage({ search: { body: { query: { search: [] } } } });

    const guide = await getGuide('Nowhereville');
    expect(guide?.coverage).toBe('none');
    expect(guide?.title).toBe('Nowhereville');
    expect(guide?.sections).toEqual({
      eat: null,
      see: null,
      do: null,
      getAround: null,
      getIn: null,
    });
  });

  it('returns null (never throws) on a network error', async () => {
    mockWikivoyage({ search: 'throw' });
    await expect(getGuide('Fukuoka')).resolves.toBeNull();
  });

  it('degrades to coverage "none" (never throws) when the search request is not ok', async () => {
    // A non-ok HTTP response is indistinguishable from "no hit" once apiGet
    // collapses it to null — same honest-degrade path as the no-hit case.
    mockWikivoyage({ search: { ok: false, body: {} } });
    const guide = await getGuide('Fukuoka');
    expect(guide?.coverage).toBe('none');
  });

  it('caches a guide for 24h and avoids a second fetch chain', async () => {
    const fetchMock = mockWikivoyage({
      search: searchHit('Fukuoka'),
      sections: sectionsBody(FUKUOKA_SECTIONS),
      wikitext: (idx) => wikitextBody(FUKUOKA_WIKITEXT[idx]),
    });

    await getGuide('Fukuoka');
    const callsAfterFirst = fetchMock.mock.calls.length;
    await getGuide('Fukuoka');

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('stripWikitext', () => {
  it('drops templates', () => {
    expect(stripWikitext('Before {{convert|10|km}} after.')).toBe(
      'Before  after.',
    );
  });

  it('unwraps piped and plain wikilinks', () => {
    expect(
      stripWikitext('Visit [[Yatai|the street stalls]] near [[Ohori Park]].'),
    ).toBe('Visit the street stalls near Ohori Park.');
  });

  it('preserves prices in prose verbatim', () => {
    expect(
      stripWikitext(
        'An all-day subway pass costs ¥640; regular tickets ¥210-380.',
      ),
    ).toBe('An all-day subway pass costs ¥640; regular tickets ¥210-380.');
  });

  it('strips bold/italic markup and list markers', () => {
    expect(stripWikitext("* '''Fukuoka Tower''' costs ''¥1000''.")).toBe(
      'Fukuoka Tower costs ¥1000.',
    );
  });

  it('drops HTML comments and collapses blank-line runs', () => {
    expect(stripWikitext('A<!-- note -->B\n\n\n\nC')).toBe('AB\n\nC');
  });

  it('decodes HTML entities so they do not render literally', () => {
    // Real Fukuoka Tower prose writes its height as "234&nbsp;m"; React
    // escapes on render, so an undecoded entity shows up as literal text.
    expect(stripWikitext('The tower is 234&nbsp;m tall &amp; free.')).toBe(
      'The tower is 234 m tall & free.',
    );
    // &amp; is decoded last, so an escaped entity survives as visible text.
    expect(stripWikitext('&amp;lt; stays literal')).toBe('&lt; stays literal');
  });

  it('unwraps a {{see}} listing template into "name — price — content", with the price verbatim', () => {
    // Real Wikivoyage wikitext for Tōchō-ji (Fukuoka's See section) — this
    // exact case is what motivated the fix: dropping the template wholesale
    // used to throw away the ¥100 price along with the noise fields.
    const tochoji =
      '{{see\n| name=Tōchō-ji | alt= | url= | email=\n| address= | lat=33.595 | long=130.414167 | directions=\n| phone= | tollfree=\n| hours= | price=Free entry; ¥100 to see the Buddha\n| wikipedia=Tōchō-ji | wikidata=Q3547067\n| content=It has a 10.8-m wooden Great Buddha.\n| lastedit=2026-05-06\n}}';

    expect(stripWikitext(tochoji)).toBe(
      'Tōchō-ji — Free entry; ¥100 to see the Buddha — It has a 10.8-m wooden Great Buddha.',
    );
  });

  it('still drops non-listing templates like {{Mapframe}} and {{Mapshapes}}', () => {
    const stripped = stripWikitext(FUKUOKA_SEE_WIKITEXT);
    expect(stripped).not.toContain('Mapframe');
    expect(stripped).not.toContain('Mapshapes');
    expect(stripped).toContain('Nakasu');
  });

  it('produces a clean line with no dangling separators for a listing whose fields are mostly blank', () => {
    // Nakasu: only name and content are populated; address, hours, price,
    // and the noise fields (lat/long/image/lastedit/...) are all blank.
    const nakasu =
      "* {{see\n| name=Nakasu | alt= | url= | email=\n| address= | lat=33.593249 | long=130.405667 | directions=\n| phone= | tollfree= | fax=\n| hours= | price=\n| image=Fukuoka Bike.jpg\n| lastedit=2016-03-15\n| content=This area is next to Tenjin and is Fukuoka's red-light district, with over 3500 restaurants, as well as ramen stalls (yatai), shopping, pubs, hostess bars, rooftop beer gardens in summer, one surviving movie theater, and sex trade. The neon lights on the Naka River are famous with over 60,000 visitors a day, and it has the busiest street in Kyushu.\n}}";

    const stripped = stripWikitext(nakasu);
    expect(stripped).toBe(
      "Nakasu — This area is next to Tenjin and is Fukuoka's red-light district, with over 3500 restaurants, as well as ramen stalls (yatai), shopping, pubs, hostess bars, rooftop beer gardens in summer, one surviving movie theater, and sex trade. The neon lights on the Naka River are famous with over 60,000 visitors a day, and it has the busiest street in Kyushu.",
    );
    expect(stripped).not.toContain('— —');
    expect(stripped.startsWith('—')).toBe(false);
    expect(stripped.endsWith('—')).toBe(false);
  });

  it('drops [[File:...]] image embeds rather than unwrapping them into "thumb|caption"', () => {
    expect(
      stripWikitext(
        '[[File:Hakatara-men.jpg|thumb|Hakata tonkotsu ramen]]\n\nText.',
      ),
    ).toBe('Text.');
  });
});
