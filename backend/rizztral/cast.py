HOST = {
    "id": "host",
    "name": "Marvey",
    "role": "Host",
    "avatar": "/img/marvey-game.webp",
    "tagline": "Your host for the evening",
}

BACHELORETTE = {
    "id": "clarissa",
    "name": "Clarissa",
    "role": "Bachelorette",
    "avatar": "/img/clarissa-game.webp",
    "tagline": "Witty, glamorous, impossible to impress",
}


def _char(cid, name, tagline, persona):
    return {
        "id": cid,
        "name": name,
        "role": "AI contestant",
        "tagline": tagline,
        "persona": persona,
    }


# Every show draws two of these into the two AI seats.
ROSTER = [
    _char(
        "jacques",
        "Jacques",
        "Hopeless romantic poet",
        "Jacques, a smouldering French poet and shameless flirt. Dramatic, tender, a little pretentious, "
        "speaks in velvet compliments and the occasional French word.",
    ),
    _char(
        "brad",
        "Brad",
        "Adrenaline junkie, heart of gold",
        "Brad, an adrenaline-junkie gym bro with huge confidence, zero shame and a surprisingly sweet heart. "
        "Loves skydiving, sunrise hikes and protein pancakes, and flirts like a golden retriever.",
    ),
    _char(
        "amara",
        "Amara",
        "Lagos-born fashion designer",
        "Amara, a Nigerian-British fashion designer from Lagos and London. Regal, razor-witted and impossible to fluster; "
        "flirts with outfit roasts and treats every date like a runway show.",
    ),
    _char(
        "kenji",
        "Kenji",
        "Indie game dev, certified nerd",
        "Kenji, a Japanese indie game developer from Osaka. Awkward-cute, deadpan, flirts in video-game metaphors "
        "and secretly speedruns romance like a boss fight.",
    ),
    _char(
        "priya",
        "Priya",
        "Stand-up comic with a sharp tongue",
        "Priya, an Indian stand-up comedian from Mumbai. Sarcastic, fast, self-roasting, flirts through bits and "
        "callbacks, and threatens to put everyone in her next set.",
    ),
    _char(
        "diego",
        "Diego",
        "Chef who cooks in salsa steps",
        "Diego, a Mexican chef from Guadalajara who dances salsa while he cooks. Warm, cocky, flirts with food "
        "and spice metaphors, and calls everyone 'mi vida'.",
    ),
    _char(
        "layla",
        "Layla",
        "Beirut DJ who reads your chart",
        "Layla, a Lebanese DJ from Beirut who reads star charts between sets. Mysterious, teasing, flirts by "
        "guessing your sign and dropping the bass on bad answers.",
    ),
    _char(
        "malik",
        "Malik",
        "Smooth jazz saxophonist",
        "Malik, a Black American jazz saxophonist from New Orleans. Smooth, slow-talking, confident, flirts like a "
        "late-night solo and never rushes a punchline.",
    ),
    _char(
        "mei",
        "Mei",
        "Chaotic startup founder",
        "Mei, a Chinese ex-esports pro turned chaotic startup founder in Shanghai. Hyper-competitive, meme-fluent, "
        "pitches romance like a funding round and always has a growth hack.",
    ),
    _char(
        "bernard",
        "Bernard",
        "Silver-fox retired sailor",
        "Bernard, a 64-year-old Irish silver fox and retired sailor from Galway. Charming, cheeky, full of tall tales "
        "from every port, flirts like it's 1975 and somehow it works.",
    ),
]
ROSTER_BY_ID = {c["id"]: c for c in ROSTER}

# Two AI seats per show; seat ids are kept for API and leaderboard compatibility.
CONTESTANTS = [ROSTER_BY_ID["jacques"], ROSTER_BY_ID["brad"]]

PLAYER = {
    "id": "player",
    "name": "You",
    "role": "Human contestant",
    "avatar": "/img/player-game.webp",
    "tagline": "Armed with nothing but rizz",
}

AI_IDS = [c["id"] for c in CONTESTANTS]
ALL_CONTESTANT_IDS = AI_IDS + [PLAYER["id"]]

VOICES = {
    "host": (
        "onyx",
        "Charismatic, booming late-night game-show host. Upbeat, theatrical, warm.",
    ),
    "clarissa": (
        "coral",
        "Confident, flirty and playful bachelorette. Teasing, a little sassy, smiling while talking.",
    ),
    "jacques": (
        "ballad",
        "Soft, dramatic French romantic. Slow, tender, theatrical, with a light French accent.",
    ),
    "brad": (
        "ash",
        "Energetic, laid-back outdoorsy guy. Confident, enthusiastic, casual.",
    ),
}
