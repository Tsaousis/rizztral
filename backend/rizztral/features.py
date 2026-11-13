import datetime
import random

TYPES = {
    "funny": {
        "label": "Funny",
        "desc": "answers that make you laugh out loud: jokes, absurdity, self-roasting",
        "words": ("haha", "lol", "joke", "laugh", "funny", "ridiculous", "pun", "embarrass", "awkward"),
        "hint": "Honestly, nothing is more attractive than making me laugh.",
        "fans": ("brad",),
    },
    "poetic": {
        "label": "Poetic",
        "desc": "romantic, vivid, poetic answers with imagery and feeling",
        "words": ("moon", "star", "heart", "poem", "forever", "soul", "sunset", "dream", "ocean"),
        "hint": "Say it like you mean it. Paint me a picture.",
        "fans": ("jacques",),
    },
    "nerdy": {
        "label": "Nerdy",
        "desc": "nerdy, curious answers: science, books, games, weird facts",
        "words": ("science", "space", "book", "code", "fact", "history", "math", "physics", "nerd", "game"),
        "hint": "Big brain energy is my weakness. Teach me something.",
        "fans": (),
    },
    "bold": {
        "label": "Bold",
        "desc": "bold, confident, spontaneous answers that take risks",
        "words": ("dare", "adventure", "wild", "risk", "jump", "tonight", "fearless", "chaos", "spontaneous"),
        "hint": "I like someone who makes the first move.",
        "fans": ("brad",),
    },
    "sweet": {
        "label": "Sweet",
        "desc": "warm, kind, sweet answers that feel safe and cosy",
        "words": ("kind", "care", "together", "home", "gentle", "hug", "cozy", "cosy", "family"),
        "hint": "Soft hearts are winning tonight.",
        "fans": ("jacques",),
    },
}
TYPE_BONUS = 2
PROFILES = {
    "funny": ("The Comedian", "Rizz through laughter. Dangerous at dinner parties."),
    "poetic": ("The Poet", "Talks in sunsets. Probably owns a notebook."),
    "nerdy": ("The Big Brain", "Flirts with facts. Somehow it works."),
    "bold": ("Chaos Charmer", "Zero hesitation, maximum plot."),
    "sweet": ("The Golden Retriever", "Warm, loyal, impossible to dislike."),
}


def matches(type_id: str, text: str) -> bool:
    text = (text or "").lower()
    return any(word in text for word in TYPES[type_id]["words"])


def daily_key(now: datetime.datetime | None = None) -> str:
    return (now or datetime.datetime.now(datetime.UTC)).date().isoformat()


def daily_rng(key: str) -> random.Random:
    return random.Random(f"rizztral-daily-{key}")


def profile(answers: list[str]) -> dict:
    answers = [a for a in answers if a]
    if not answers or sum(len(a.split()) for a in answers) / len(answers) < 6:
        return {"title": "The Dry Texter", "blurb": "Short, mysterious, possibly asleep."}
    counts = {t: sum(matches(t, a) for a in answers) for t in TYPES}
    best = max(counts, key=counts.get)
    if not counts[best]:
        return {"title": "The Wildcard", "blurb": "Impossible to read. Clarissa is intrigued."}
    title, blurb = PROFILES[best]
    return {"title": title, "blurb": blurb}
