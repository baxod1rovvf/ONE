// Where Core's daily news comes from. Every source is a public RSS or Atom
// feed; YouTube channels are read through their public channel feeds, and
// their videos play inside Core from YouTube itself (nothing is downloaded).
//
// A source that fails (gone, renamed, blocked) is skipped and named in the
// run's log, so the edition is built from whatever is reachable that day.
// To add one: give it a topic from PLAN below and either a `url` (RSS/Atom)
// or a `youtube` channel id (the "UC…" part of a channel address).

// What one edition holds: 9 stories, then the fun fact makes 10.
// `videos` is how many of a topic's stories should be videos when there are any.
export const PLAN = [
  { topic: "world", side: "serious", label: "World & politics", count: 3, videos: 1 },
  { topic: "tech", side: "serious", label: "Technology", count: 2, videos: 1 },
  { topic: "funny", side: "light", label: "Funny & odd", count: 2, videos: 0 },
  { topic: "animals", side: "light", label: "Animals", count: 2, videos: 1 }
];

// Words that mark a story as being about animals, for general science feeds.
const ANIMALS = /\b(animal|animals|dog|dogs|puppy|cat|cats|kitten|bird|birds|whale|whales|dolphin|shark|elephant|lion|tiger|bear|bears|wolf|wolves|fox|monkey|ape|gorilla|chimp|panda|penguin|turtle|tortoise|frog|snake|insect|bee|bees|butterfly|spider|octopus|seal|otter|horse|cow|sheep|goat|pig|owl|eagle|parrot|species|wildlife|zoo|fish|beaver|koala|kangaroo|deer|rhino|giraffe|hippo|crocodile|bat|bats|squirrel|hedgehog)\b/i;

export const SOURCES = [
  // World & politics
  { topic: "world", name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { topic: "world", name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { topic: "world", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { topic: "world", name: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml" },
  { topic: "world", name: "BBC News", youtube: "UC16niRr50-MSBwiO3YDb3RA" },
  { topic: "world", name: "Reuters", youtube: "UChqUTb7kYRX8-EiaN3XFrSQ" },
  { topic: "world", name: "Associated Press", youtube: "UC52X5wxOL_s5yw0dQk7NtgA" },

  // Technology
  { topic: "tech", name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { topic: "tech", name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { topic: "tech", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { topic: "tech", name: "The Verge", youtube: "UCddiUEpeqJcYeBxX1IVBKvQ" },
  { topic: "tech", name: "Marques Brownlee", youtube: "UCBJycsmduvYEL83R_U4JriQ" },
  { topic: "tech", name: "WIRED", youtube: "UCftwRNsjfRo08xYE31tkiyw" },

  // Funny & odd
  { topic: "funny", name: "UPI Odd News", url: "https://rss.upi.com/news/odd_news.rss" },
  { topic: "funny", name: "Oddity Central", url: "https://www.odditycentral.com/feed" },
  { topic: "funny", name: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/" },

  // Animals
  { topic: "animals", name: "The Guardian", url: "https://www.theguardian.com/environment/wildlife/rss" },
  { topic: "animals", name: "Good News Network", url: "https://www.goodnewsnetwork.org/category/news/animals/feed/" },
  { topic: "animals", name: "BBC Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", match: ANIMALS },
  { topic: "animals", name: "The Dodo", youtube: "UCINb0wqPz-A0dV9nARjJlOQ" },
  { topic: "animals", name: "BBC Earth", youtube: "UCwmZiChSryoWQCZMIQezgTg" },
  { topic: "animals", name: "National Geographic", youtube: "UCpVm7bg6pXKo1Pr6k5kxG9A", match: ANIMALS }
];

export const youtubeFeed = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

// The fun fact: one a day from this service, with FACTS (facts.mjs) as the
// fallback when it can't be reached or only repeats recent facts.
export const FACT_TODAY = "https://uselessfacts.jsph.pl/api/v2/facts/today?language=en";
export const FACT_RANDOM = "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en";
