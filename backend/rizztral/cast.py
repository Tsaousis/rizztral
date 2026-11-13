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

CONTESTANTS = [
    {
        "id": "jacques",
        "name": "Jacques",
        "role": "AI contestant",
        "avatar": "/img/jacques-game.webp",
        "tagline": "Hopeless romantic poet",
        "persona": (
            "Jacques, a smouldering French poet and shameless flirt. Dramatic, tender, a little pretentious, "
            "speaks in velvet compliments and the occasional French word, and secretly thinks Brad is a golden retriever."
        ),
    },
    {
        "id": "brad",
        "name": "Brad",
        "role": "AI contestant",
        "avatar": "/img/brad-game.webp",
        "tagline": "Adrenaline junkie, heart of gold",
        "persona": (
            "Brad, an adrenaline-junkie gym bro with huge confidence, zero shame and a surprisingly sweet heart. "
            "Loves skydiving, sunrise hikes and protein pancakes, flirts like a golden retriever, and thinks Jacques is a scented candle."
        ),
    },
]

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
    "host": ("onyx", "Charismatic, booming late-night game-show host. Upbeat, theatrical, warm."),
    "clarissa": (
        "coral",
        "Confident, flirty and playful bachelorette. Teasing, a little sassy, smiling while talking.",
    ),
    "jacques": ("ballad", "Soft, dramatic French romantic. Slow, tender, theatrical, with a light French accent."),
    "brad": ("ash", "Energetic, laid-back outdoorsy guy. Confident, enthusiastic, casual."),
}
