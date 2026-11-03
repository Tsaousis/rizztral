HOST = {
    "id": "host",
    "name": "Marvey",
    "role": "Host",
    "avatar": "/img/marvey.jpg",
    "tagline": "Your host for the evening",
}

BACHELORETTE = {
    "id": "clarissa",
    "name": "Clarissa",
    "role": "Bachelorette",
    "avatar": "/img/target.jpg",
    "tagline": "Witty, glamorous, impossible to impress",
}

CONTESTANTS = [
    {
        "id": "jacques",
        "name": "Jacques",
        "role": "AI contestant",
        "avatar": "/img/jacques.jpg",
        "tagline": "Hopeless romantic poet",
        "persona": (
            "Jacques, a hopeless romantic French poet. Dramatic, tender, a little pretentious, "
            "fond of metaphors about moonlight and croissants. Occasionally drops a French word."
        ),
    },
    {
        "id": "brad",
        "name": "Brad",
        "role": "AI contestant",
        "avatar": "/img/brad.jpg",
        "tagline": "Adrenaline junkie, heart of gold",
        "persona": (
            "Brad, an adrenaline-junkie outdoorsman with gym-bro confidence and a surprisingly "
            "sweet heart. Loves skydiving, sunrise hikes and protein pancakes. Says 'honestly' a lot."
        ),
    },
]

PLAYER = {
    "id": "player",
    "name": "You",
    "role": "Human contestant",
    "avatar": "/img/chad.jpg",
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
