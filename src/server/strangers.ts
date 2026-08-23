/* Community member pool + conversational behavior engine for the embedded server.
   In the Express deployment these peers are simply other real connected clients;
   the engine contract (openers, replies, pacing) stays identical. */

export interface PersonaDef {
  username: string;
  age: number;
  gender: "male" | "female" | "nonbinary";
  country: string;
  langs: string[];
  interests: string[];
  convTypes: string[];
  bio: string;
  hue: number;
}

export const PERSONAS: PersonaDef[] = [
  { username: "Aisha", age: 24, gender: "female", country: "India", langs: ["English", "Hindi"], interests: ["Programming", "Artificial Intelligence", "Music"], convTypes: ["Coding", "Casual"], bio: "Backend dev by day, lo-fi playlists by night.", hue: 160 },
  { username: "Rahul", age: 27, gender: "male", country: "India", langs: ["English", "Hindi", "Telugu"], interests: ["PC Gaming", "Esports", "Technology"], convTypes: ["Gaming", "Casual"], bio: "Chasing rank in everything I play.", hue: 20 },
  { username: "Sarah", age: 29, gender: "female", country: "United Kingdom", langs: ["English"], interests: ["Movies", "Books", "Music"], convTypes: ["Movies", "Casual"], bio: "Will absolutely spoil the ending if you ask nicely.", hue: 320 },
  { username: "Miguel", age: 31, gender: "male", country: "Spain", langs: ["English", "Spanish"], interests: ["Travel", "Food", "Photography"], convTypes: ["Travel", "Casual"], bio: "31 countries and counting. Ask me about the food.", hue: 40 },
  { username: "Yuki", age: 25, gender: "female", country: "Japan", langs: ["English", "Japanese"], interests: ["Anime", "Movies", "Game Development"], convTypes: ["Gaming", "Movies"], bio: "Making a tiny pixel-art game, slowly.", hue: 260 },
  { username: "Chen", age: 28, gender: "male", country: "Singapore", langs: ["English"], interests: ["Startups", "Web Development", "Artificial Intelligence"], convTypes: ["Networking", "Coding"], bio: "Building in public. Two failed startups, one stubborn one.", hue: 200 },
  { username: "Amara", age: 26, gender: "female", country: "Nigeria", langs: ["English"], interests: ["Fitness", "Fashion", "Music"], convTypes: ["Casual", "Friendship"], bio: "5am runs and afrobeats.", hue: 300 },
  { username: "Tom", age: 34, gender: "male", country: "United States", langs: ["English"], interests: ["Debate", "Science", "Books"], convTypes: ["Debate", "Study"], bio: "I'll steelman your argument, then take it apart.", hue: 220 },
  { username: "Priya", age: 23, gender: "female", country: "India", langs: ["English", "Tamil"], interests: ["Competitive Exams", "Mathematics", "Learning"], convTypes: ["Study", "Friendship"], bio: "CAT aspirant. Flashcards are my personality now.", hue: 120 },
  { username: "Lucas", age: 22, gender: "male", country: "Brazil", langs: ["English", "Portuguese"], interests: ["PC Gaming", "Music", "Technology"], convTypes: ["Gaming", "Casual"], bio: "If it has a leaderboard, I'm on it.", hue: 80 },
  { username: "Elif", age: 27, gender: "female", country: "Turkey", langs: ["English", "Turkish"], interests: ["Photography", "Fashion", "Travel"], convTypes: ["Casual", "Travel"], bio: "Street photographer. Istanbul light is unbeatable.", hue: 350 },
  { username: "David", age: 38, gender: "male", country: "Germany", langs: ["English", "German"], interests: ["Robotics", "Artificial Intelligence", "Cybersecurity"], convTypes: ["Coding", "Networking"], bio: "Robots are easy. Meetings are hard.", hue: 180 },
  { username: "Nia", age: 21, gender: "female", country: "Canada", langs: ["English", "French"], interests: ["TV", "Anime", "Friendship"], convTypes: ["Casual", "Friendship"], bio: "Professional episode recommender.", hue: 280 },
  { username: "Omar", age: 30, gender: "male", country: "UAE", langs: ["English"], interests: ["Startups", "Networking", "Fitness"], convTypes: ["Networking", "General"], bio: "Founder meetups in Dubai. Say hi if you're building.", hue: 60 },
];

export function dobFromAge(age: number): string {
  const y = new Date().getFullYear() - age;
  return `${y - 1}-11-${String(10 + (age % 18)).padStart(2, "0")}`;
}

/* ---------------- conversation starters ---------------- */

const STARTERS: Record<string, string> = {
  Programming: "What are you currently building?",
  "Artificial Intelligence": "What's the coolest thing AI has done for you lately?",
  "PC Gaming": "What game are you playing right now?",
  Esports: "Which team are you riding for this season?",
  Movies: "What's a movie you can rewatch forever?",
  TV: "What show are you bingeing right now?",
  Music: "What's on repeat for you this week?",
  Travel: "Where's the last place that genuinely surprised you?",
  Food: "What's the best thing you ate this month?",
  Books: "What are you reading right now?",
  Fitness: "What's your go-to workout?",
  Startups: "What problem would you love to solve?",
  "Competitive Exams": "What are you preparing for right now?",
  Mathematics: "What's a math idea you find genuinely beautiful?",
  Photography: "What do you love shooting the most?",
  Anime: "What anime would you recommend to a beginner?",
  Debate: "What's a hill you will absolutely die on?",
  Cybersecurity: "What's a security habit everyone should have?",
  Robotics: "What's the most fun robot you've seen recently?",
  Science: "What science topic could you give a 30-minute talk on, no prep?",
};
export const DEFAULT_STARTER = "What's something you could talk about for hours?";

export function starterFor(interestNames: string[]): string {
  for (const n of interestNames) if (STARTERS[n]) return STARTERS[n];
  return DEFAULT_STARTER;
}

/* ---------------- reply engine ---------------- */

type Bucket = "code" | "ai" | "gaming" | "movies" | "music" | "travel" | "food" | "fitness" | "books" | "anime" | "startups" | "photo" | "science" | "debate" | "study" | "tech";

const BUCKET_OF: Record<string, Bucket> = {
  Programming: "code", "Web Development": "code", "Mobile Development": "code", "Game Development": "code", Cybersecurity: "code",
  "Artificial Intelligence": "ai", Robotics: "ai",
  "PC Gaming": "gaming", "Mobile Gaming": "gaming", "Console Gaming": "gaming", Esports: "gaming",
  Movies: "movies", TV: "movies",
  Music: "music",
  Travel: "travel",
  Food: "food",
  Fitness: "fitness", Fashion: "photo", Photography: "photo",
  Books: "books",
  Anime: "anime",
  Startups: "startups", Networking: "startups",
  Science: "science", Technology: "tech",
  Debate: "debate",
  "Competitive Exams": "study", Mathematics: "study", Learning: "study", College: "study", School: "study", Languages: "study",
  Friendship: "music", "Casual Conversation": "travel", Relationships: "books", General: "travel", Coding: "code", Gaming: "gaming", Study: "study", Casual: "travel",
};

const LINES: Record<Bucket, string[]> = {
  code: [
    "I've been deep in a side project lately — a little CLI tool that refuses to stay small.",
    "Honestly the best part of coding is when the bug turns out to be ONE character.",
    "I'm team 'read the docs last', which is exactly why I suffer.",
    "What's your stack right now? I keep meaning to try something new.",
  ],
  ai: [
    "I used an AI agent to clean up my test suite last week. It was humbling.",
    "The pace is wild — half my feed is papers, half is doom. Balance, right?",
    "I think the underrated skill now is asking better questions.",
    "Are you building with AI tools or mostly avoiding them?",
  ],
  gaming: [
    "I told myself 'one more match' at 11pm. It is no longer 11pm.",
    "My rank and my sleep schedule are in a committed rivalry.",
    "Controller or keyboard? There is a wrong answer and it's yours.",
    "What are you grinding right now? I need something new.",
  ],
  movies: [
    "I rewatched a comfort movie instead of sleeping. No regrets.",
    "Hot take: the book was better, but the soundtrack wins.",
    "I keep a list of movies to watch 'when I have time'. It is not going well.",
    "What's a film you wish you could watch again for the first time?",
  ],
  music: [
    "My playlist is 40% focus beats, 40% nostalgia, 20% guilt.",
    "I found a tiny artist with 900 monthly listeners and now I'm personally invested.",
    "Concerts this year have been unreal. My wallet disagrees.",
    "What's your 'no skips' album?",
  ],
  travel: [
    "Best trip mistake I ever made: skipping the tourist thing everyone said to skip. It was great.",
    "I plan trips around food first, sights second, sleep last.",
    "Night trains are criminally underrated.",
    "Where's next on your list? I might have opinions.",
  ],
  food: [
    "I attempted a recipe from a video. The smoke alarm was not impressed.",
    "Street food > restaurant food. I will not be taking questions.",
    "I rate cities by their breakfast options. It's a lifestyle.",
    "What's your comfort food after a long day?",
  ],
  fitness: [
    "5am club is real. The first week is a lie detector test.",
    "I switched to morning workouts and my evenings got their personality back.",
    "Rest days are where the growth happens. I'm told. I don't believe it.",
    "What's your split looking like these days?",
  ],
  books: [
    "I bought three books this month. I finished one chapter. It's a hobby.",
    "There's a special joy in a book that wrecks you a little.",
    "I annotate my books like I'm being graded.",
    "Recommend me something — I trust stranger taste.",
  ],
  anime: [
    "I said 'just one episode' like a fool. It's 2am now.",
    "The opening songs carry me through entire arcs.",
    "I keep a watchlist longer than my to-do list. Balance.",
    "What's your comfort anime?",
  ],
  startups: [
    "Idea validation is 10% research, 90% talking to strangers. Hence, here I am.",
    "My last postmortem taught me more than two years of 'success'.",
    "Distribution eats product for breakfast. Harsh but true.",
    "What would you build if money weren't a thing?",
  ],
  photo: [
    "Golden hour is the only deadline I respect.",
    "I shot 400 frames yesterday. Keepers: three. Normal.",
    "People say gear doesn't matter, then borrow my lens.",
    "Do you edit your photos or keep them raw?",
  ],
  science: [
    "I fell into a paper rabbit hole about mycelium networks. Nature's internet.",
    "The best science is when the simple question has no simple answer.",
    "I explain my research to my family yearly. It gets shorter each time.",
    "What topic could you talk about for an hour, no prep?",
  ],
  debate: [
    "I'll argue either side, but I'll only *believe* one. There are rules.",
    "Steelmanning is a superpower. Most people skip it.",
    "The best debates end with 'huh, I hadn't thought of that.'",
    "Give me a take. I'll be gentle. Probably.",
  ],
  study: [
    "Flashcard streak: 74 days. My personality? Also flashcards.",
    "Pomodoro works until the timer becomes a suggestion.",
    "I explain concepts to an empty chair. The chair is very smart now.",
    "What are you studying for right now?",
  ],
  tech: [
    "New gadget day is the best day. The setup ritual is sacred.",
    "I read release notes for fun. It's a problem, I know.",
    "Every 'smart' device in my house is one update from a personality change.",
    "What piece of tech do you actually love?",
  ],
};

const ACKS = ["haha true", "exactly!", "ok that's a take 😄", "same honestly", "wait really? more", "noted. respected.", "loud and clear"];
const RETURN_Q = ["what got you into that?", "how long have you been into it?", "what's the best part of it for you?", "where would you tell a beginner to start?", "and what do you do when you're not doing that?"];
const GREET = ["hey! good timing, I just sat down", "heyy how's your day going?", "hello hello 👋", "hey, you caught me mid-coffee"];

const KEYWORDS: Array<[RegExp, Bucket]> = [
  [/\b(code|coding|program|develop|javascript|python|app|software|bug)\b/, "code"],
  [/\b(ai|ml|model|gpt|neural|agent|llm)\b/, "ai"],
  [/\b(game|gaming|play|esport|rank|match|console)\b/, "gaming"],
  [/\b(movie|film|cinema|director)\b/, "movies"],
  [/\b(music|song|album|band|concert|playlist)\b/, "music"],
  [/\b(travel|trip|country|city|flight|backpack)\b/, "travel"],
  [/\b(food|eat|cook|recipe|restaurant)\b/, "food"],
  [/\b(gym|workout|run|fitness|lift)\b/, "fitness"],
  [/\b(book|read|novel|author)\b/, "books"],
  [/\b(anime|manga)\b/, "anime"],
  [/\b(startup|founder|business|venture|product)\b/, "startups"],
  [/\b(photo|camera|shoot|lens)\b/, "photo"],
  [/\b(science|physics|biology|research|space)\b/, "science"],
  [/\b(debate|argue|opinion|take)\b/, "debate"],
  [/\b(study|exam|learn|math|college|school)\b/, "study"],
];

export interface ReplyPlan { texts: string[]; typingMs: number }

export function buildOpener(sharedNames: string[], username: string): ReplyPlan {
  const shared = sharedNames.length ? sharedNames : ["good conversation"];
  const q = starterFor(sharedNames);
  const open = `hey ${username}! I saw we both like ${shared.slice(0, 2).join(" and ")} — `;
  const texts = [open + "always a good sign.", q];
  return { texts, typingMs: 1400 + texts.join("").length * 18 };
}

export function buildReply(personaInterests: string[], country: string, userText: string, turn: number, username: string): ReplyPlan {
  const t = userText.toLowerCase().trim();
  let texts: string[];

  const bucket: Bucket | null = (() => {
    for (const [re, b] of KEYWORDS) if (re.test(t)) return b;
    for (const interest of personaInterests) {
      const b = BUCKET_OF[interest];
      if (b && interest.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w))) return b;
    }
    return null;
  })();

  if (/^(hi|hey|hello|yo|hola|heyy+)\b/.test(t) && t.length < 24) {
    texts = [pickOf(GREET), lineFrom(bucket ?? randomBucket(personaInterests))];
  } else if (/\bwhere are you\b|\bfrom where\b|\byour country\b|\bwhere do you live\b/.test(t)) {
    texts = [`I'm in ${country}! Timezone math is my cardio.`, "where are you chatting from?"];
  } else if (/\bhow are you\b|how's it going|hows it going|what's up|wassup|sup\b/.test(t)) {
    texts = ["doing good! was just thinking about " + topicNoun(bucket ?? randomBucket(personaInterests)) + ". you?", pickOf(RETURN_Q)];
  } else if (t.endsWith("?")) {
    texts = [lineFrom(bucket ?? randomBucket(personaInterests)), ...(turn < 4 ? [pickOf(RETURN_Q)] : [])];
  } else {
    const ack = pickOf(ACKS);
    const line = bucket ? lineFrom(bucket) : undefined;
    texts = [line ? `${ack} ${line}` : ack];
    if (turn >= 1 && (turn % 3 === 0 || Math.random() < 0.55)) texts.push(pickOf(RETURN_Q));
  }

  if (turn > 3 && Math.random() < 0.12 && texts.length === 1) {
    texts.push(pickOf(RETURN_Q));
  }
  if (texts[0].includes("{name}")) texts[0] = texts[0].replace("{name}", username);

  const typingMs = Math.min(5200, 750 + texts.join(" ").length * 24);
  return { texts, typingMs };
}

export function nextProbability(turn: number, recentShortCount: number): number {
  if (recentShortCount >= 3 && turn > 3) return 0.3;
  if (turn >= 9) return Math.min(0.22, 0.045 * (turn - 7));
  return 0;
}

export function connectionAcceptChance(sharedCount: number): number {
  if (sharedCount >= 2) return 0.85;
  if (sharedCount === 1) return 0.6;
  return 0.3;
}

function lineFrom(b: Bucket): string {
  return pickOf(LINES[b]);
}
function randomBucket(interests: string[]): Bucket {
  const b = BUCKET_OF[pickOf(interests)] ?? "travel";
  return b;
}
function topicNoun(b: Bucket): string {
  const map: Record<Bucket, string> = { code: "a tiny side project", ai: "these new AI agents", gaming: "my ranked grind", movies: "that film I rewatched", music: "this playlist", travel: "a trip I'm planning", food: "a recipe disaster", fitness: "my morning run", books: "this book", anime: "this season's lineup", startups: "an idea I'm validating", photo: "a photo walk", science: "a rabbit hole", debate: "a take I'm sharpening", study: "my flashcards", tech: "a gadget review" };
  return map[b];
}
function pickOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
