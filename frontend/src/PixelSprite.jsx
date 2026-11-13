const W = 24

const BASE = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........oooooooo........',
  '.......ossssssssso......',
  '......ossssssssssso.....',
  '......ossssssssssso.....',
  '......ossssssssssso.....',
  '.....osssssssssssso.....',
  '.....osssssssssssso.....',
  '.....osssssssssssso.....',
  '......ossssssssssso.....',
  '......ossssssssssso.....',
  '......oSssssssssSo......',
  '.......oSssssssSo.......',
  '........oooooooo........',
  '..........oSSo..........',
  '..........osso..........',
  '....oocccc....ccccoo....',
  '..oocccccc....ccccccoo..',
  '.occcccccccc..cccccccco.',
  '.oCcccccccccccccccccCco.',
  '.oCcccccccccccccccccCco.',
  '.oCcccccccccccccccccCco.',
  '.oCcccccccccccccccccCco.',
]

const FACE = [
  ...Array(9).fill('........................'),
  '........hhh..hhh........',
  '.........we..ew.........',
  '.........ee..ee.........',
  '...........S............',
  '........b......b........',
]

const MOUTHS = {
  closed: { 14: '..........mmmm..........' },
  half: { 14: '..........mmmm..........', 15: '...........tt...........' },
  open: { 13: '..........mmmm..........', 14: '..........mttm..........', 15: '...........mm...........' },
}

const MOODS = {
  love: {
    10: '........RsR..RsR........',
    11: '........RRR..RRR........',
    12: '.........R....R.........',
    13: '.......bb......bb.......',
  },
  blush: {
    10: '.........ss..ss.........',
    11: '.........ee..ee.........',
    13: '.......bbb....bbb.......',
  },
  meh: {
    9: '........ooo..ooo........',
    10: '.........ee..ee.........',
    11: '.........ww..ww.........',
    13: '........................',
  },
}

const OUTLINE = '#2a0e4a'
const COMMON = { o: OUTLINE, w: '#ffffff', e: OUTLINE, R: '#ff2f91' }

const SPRITES = {
  clarissa: {
    colors: { s: '#f7d2e8', S: '#d9a6cc', h: '#8ff3ff', H: '#ffffff', c: '#ff6fb5', C: '#c94a8e', m: '#e0207a', t: '#ff9ccc', b: '#ff8fbf', a: '#ff2f91' },
    hair: [
      '........hhhhhhh.........',
      '......hhhhhhhhhhh.......',
      '.....hhhhHHhhhhhhhh.....',
      '....hhhhhhhhhhhhhaah....',
      '....hhhhhhhhhhhhhhhhh...',
      '...hhhhhhhhhhhhhhhhhh...',
      '...hhhhhh....hhhhhhhh...',
      '...hhhh..........hhhh...',
      ...Array(9).fill('...hhh............hhh...'),
      '...hhhh..........hhhh...',
      '..hhhhh..........hhhhh..',
      '..hhhhh..........hhhhh..',
      '..hhhh............hhhh..',
      '..hhh..............hhh..',
    ],
  },
  jacques: {
    colors: { s: '#f2b48c', S: '#c9805e', h: '#3a1f2b', H: '#6b3a4c', c: '#fff1d6', C: '#e3cfa8', m: '#7a2238', t: '#ff6b8f', b: '#ff8fa8', r: '#ff2f91', g: '#3f9e5a' },
    hair: [
      '........................',
      '........hhhhhhh.........',
      '......hhhhhhhhhhh.......',
      '.....hhhHhhhhhHhhh......',
      '....hhhhhhhhhhhhhhh.....',
      '....hhhhhHhhhhhhhhhh....',
      '....hhhh.hhh..hhhhhh....',
      '....hhh..........hhh....',
      '....hh............hh....',
      '....h..............h....',
    ],
    extra: {
      20: '......r.................',
      21: '.....rrr................',
      22: '......g.................',
    },
  },
  brad: {
    colors: { s: '#e89a6a', S: '#b86a42', h: '#ffd76a', H: '#fff0a8', c: '#ff9f43', C: '#e0702a', m: '#6a2a1a', t: '#ff6b8f', b: '#ff8f7a', f: '#ff2f91', g: OUTLINE, G: '#47eaff' },
    hair: [
      '.......h..h..h..........',
      '......hhh.hhh.hhh.......',
      '.....hhhhhhhhhhhhh......',
      '.....hhHhhhHhhhHhhh.....',
      '......hhhhhhhhhhhh......',
      '......hhhhhhhhhhhh......',
      '......h.hhh..hhh.h......',
    ],
    extra: {
      4: '.......gggG..gggG.......',
      20: '......f..........f......',
      22: '...f....f.......f...f...',
      24: '.....f......f......f....',
    },
  },
  marvey: {
    colors: { s: '#d98a62', S: '#a85f3e', h: '#1e0b2e', H: '#4a2a6a', c: '#d61f8a', C: '#9e1366', m: '#5a1a2a', t: '#ff6b8f', b: '#ff8f7a', a: '#47eaff', A: '#1fb8d0', W: '#ffffff', i: '#c9c9e0', d: '#6a6a88', k: '#1e0b2e' },
    hair: [
      '........................',
      '........hhhhhhhh........',
      '.......hhhhhhhhhHh......',
      '......hhhhhhhhhHHhh.....',
      '......hhhhhhhhhhhhh.....',
      '......hhhhhhhhhhhh......',
      '......hh.........hh.....',
      '......h..........h......',
    ],
    extra: {
      13: '..........kkkk..........',
      19: '.........aaAAaa.........',
      20: '..........WWWW..........',
      21: '...........WW...........',
      22: '..................ii....',
      23: '..................ii....',
      24: '...................d....',
      25: '...................d....',
    },
  },
  amara: {
    colors: { s: '#7a4a2e', S: '#5a3320', h: '#1a0d12', H: '#3a2530', c: '#ffcf3a', C: '#d9a21a', m: '#3a1218', t: '#ff6b8f', b: '#c0506a', y: '#47eaff' },
    hair: [
      '........................',
      '..hhhh............hhhh..',
      '.hhhhhh..........hhhhhh.',
      '.hhHhhhhhhhhhhhhhhhhHhh.',
      '.hhhhhhhhhhhhhhhhhhhhhh.',
      '..hhhhhhhhhhhhhhhhhhhh..',
      '......hhhhhhhhhhhhh.....',
      '......hhh.......hhh.....',
      '......hh.........hh.....',
    ],
    extra: {
      13: '.....y............y.....',
      14: '.....y............y.....',
    },
  },
  kenji: {
    colors: { s: '#f3cfa6', S: '#cfa07a', h: '#14121f', H: '#3a3658', c: '#47eaff', C: '#1fb8d0', m: '#7a2238', t: '#ff6b8f', b: '#ff9aa8', k: '#ff2f91' },
    hair: [
      '........................',
      '.........h..h...........',
      '.......hhhhhhhhhh.......',
      '.....hhhhhhhhhhhhhh.....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhhHhhhhhhHhhhh....',
      '....hhhhhhh.hhhhhhhh....',
      '....hhh..h....h..hhh....',
      '....hh............hh....',
    ],
    extra: {
      9: '........kkkkkkkk........',
      10: '........k..kk..k........',
      11: '........k..kk..k........',
      12: '........kkkkkkkk........',
    },
  },
  priya: {
    colors: { s: '#c98a5e', S: '#9e6540', h: '#1b0f14', H: '#4a2a36', c: '#8a4dff', C: '#5e2fd0', m: '#6a1a2a', t: '#ff6b8f', b: '#e0708a', r: '#ff2f91' },
    hair: [
      '........................',
      '........hhhhhhh.........',
      '......hhhhhhhhhhh.......',
      '.....hhhhhhhhhhhhh......',
      '....hhhhhhhhhhhhhhh.....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhhhh....hhhhhh....',
      '....hhh..........hhh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '..................hhh...',
      '...................hH...',
      '...................Hh...',
      '...................hH...',
      '...................Hh...',
      '...................rr...',
    ],
    extra: {
      8: '...........r............',
    },
  },
  diego: {
    colors: { s: '#c98458', S: '#9a5c38', h: '#24140e', H: '#4a2c1e', c: '#ff4f4f', C: '#c42a2a', m: '#5a1a1a', t: '#ff6b8f', b: '#e07a6a' },
    hair: [
      '........................',
      '.......h.h.h.h.h........',
      '......hhhhhhhhhhhh......',
      '.....hHhhHhhHhhHhh......',
      '....hhhhhhhhhhhhhhh.....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhh.hhh.hhh.hhh....',
      '....hh............hh....',
    ],
    extra: {
      13: '.........hhhhhh.........',
    },
  },
  layla: {
    colors: { s: '#e0ad86', S: '#b8825e', h: '#2a1410', H: '#5a2e22', c: '#3ad6a0', C: '#1fa078', m: '#8a1a3a', t: '#ff6b8f', b: '#ff8fa8', y: '#ffd76a' },
    hair: [
      '........................',
      '.......hhhhhhhhh........',
      '.....hhhhhhhhhhhhh......',
      '....hhhhhHhhhhhhhhh.....',
      '....hhhhhhhhhhhhhhhh....',
      '...hhhhhhhhhhhhhhhhhh...',
      '...hhhhh.......hhhhhh...',
      '...hhh............hhh...',
      '...hhh............hhh...',
      '..hhh..............hhh..',
      '..hhh..............hhh..',
      '...hhh............hhh...',
      '...hhh............hhh...',
      '..hhh..............hhh..',
      '..hhh..............hhh..',
      '...hhh............hhh...',
      '...hhh............hhh...',
      '..hhhh............hhhh..',
      '..hhh..............hhh..',
    ],
    extra: {
      14: '.....y............y.....',
      15: '.....y............y.....',
    },
  },
  malik: {
    colors: { s: '#6e4128', S: '#4e2c1a', h: '#0f0808', H: '#2a1a14', c: '#2a2a8a', C: '#1a1a5a', m: '#2a0a10', t: '#ff6b8f', b: '#9a4a4a', y: '#ffd76a' },
    hair: [
      '........................',
      '........................',
      '........................',
      '.........hhhhhh.........',
      '.......hhhhhhhhhh.......',
      '......hhhhhHhhhhhh......',
      '......hhhhhhhhhhhh......',
      '......hh........hh......',
      '......h..........h......',
    ],
    extra: {
      14: '......hh........hh......',
      15: '.......hhh....hhh.......',
      16: '........hhhhhhhh........',
      19: '..........yyyy..........',
    },
  },
  mei: {
    colors: { s: '#f5d6b8', S: '#d4a88a', h: '#16101c', H: '#ff2f91', c: '#b8ff47', C: '#7ac41f', m: '#9a1a4a', t: '#ff6b8f', b: '#ff9aa8' },
    hair: [
      '........................',
      '........hhhhhhhh........',
      '......hhhhhhhhhhhh......',
      '.....hhhhhhhhhhhHhh.....',
      '....hhhhhhhhhhhhHhhh....',
      '....hhhhhhhhhhhhHhhh....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhhhhhhhhhhhhhh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hh............hh....',
      '....hhh..........hhh....',
      '....hhhh........hhhh....',
    ],
  },
  bernard: {
    colors: { s: '#f0c4a8', S: '#c8967a', h: '#d8d8e8', H: '#ffffff', c: '#2f6bd6', C: '#1f4a9e', m: '#7a2a3a', t: '#ff6b8f', b: '#ff9a9a', w: '#ffffff' },
    hair: [
      '........................',
      '........................',
      '........................',
      '........hhhhhhh.........',
      '......hhhhhhhhhhh.......',
      '.....hhhHhhhhhhhhh......',
      '.....hhh.......hhhh.....',
      '.....hh..........hh.....',
      '.....h............h.....',
    ],
    extra: {
      13: '.........hhhhhh.........',
      15: '.......hhh....hhh.......',
      16: '........hhhhhhhh........',
      20: '..........cwwc..........',
    },
  },
  player: {
    noFace: true,
    colors: { s: '#2b1650', S: '#1e0e3a', h: '#160a2e', H: '#2b1650', c: '#21123f', C: '#160a2e', m: '#47eaff', t: '#9ff6ff', v: '#47eaff', V: '#ffffff', p: '#ff2f91' },
    hair: [
      '........................',
      '........................',
      '.......hhhhhhhhhh.......',
      '.....hhhhhhhhhhhhhh.....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhhhhhhhhhhhhhhh....',
      '....hhh..........hhh....',
      ...Array(9).fill('....hh............hh....'),
      '....hhh..........hhh....',
      '.....hhhh......hhhh.....',
      '......hhhh....hhhh......',
    ],
    extra: {
      10: '.......vvvvvvvvvv.......',
      11: '.......vVvvvvvvvv.......',
      21: '...............p.p......',
      22: '...............ppp......',
      23: '................p.......',
    },
  },
}

export function spriteGrid(id, mouth = 'closed', mood = null) {
  const sprite = SPRITES[id]
  const colors = { ...COMMON, ...sprite.colors }
  const grid = BASE.map((row) => row.split(''))
  const paint = (rows, offset = 0) => {
    Object.entries(rows).forEach(([key, row]) => {
      const y = Number(key) + offset
      ;[...row].forEach((char, x) => {
        if (char !== '.' && grid[y]) grid[y][x] = char
      })
    })
  }
  if (!sprite.noFace) paint(Object.fromEntries(FACE.map((row, y) => [y, row])))
  paint(MOUTHS[mouth])
  paint(Object.fromEntries(sprite.hair.map((row, y) => [y, row])))
  if (sprite.extra) paint(sprite.extra)
  if (mood && MOODS[mood]) paint(MOODS[mood])
  return { grid, colors }
}

function compose(id, mouth, mood) {
  const { grid, colors } = spriteGrid(id, mouth, mood)
  const rects = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < W) {
      const char = row[x]
      let end = x + 1
      while (end < W && row[end] === char) end += 1
      const fill = colors[char]
      if (char !== '.' && fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={fill} />)
      x = end
    }
  })
  return rects
}

const frameCache = new Map()
function frames(id, mood) {
  const key = `${id}:${mood || ''}`
  if (!frameCache.has(key)) {
    frameCache.set(key, Object.fromEntries(Object.keys(MOUTHS).map((m) => [m, compose(id, m, mood)])))
  }
  return frameCache.get(key)
}

export default function PixelSprite({ id, talking = false, mood = null, className = '', label }) {
  return (
    <span className={`pixel-sprite sprite-${id} ${talking ? 'is-talking' : ''} ${mood ? `mood-${mood}` : ''} ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Object.entries(frames(id, mood)).map(([mouth, rects]) => (
        <svg key={mouth} className={`frame frame-${mouth}`} viewBox={`0 0 ${W} ${BASE.length}`} shapeRendering="crispEdges">
          {rects}
        </svg>
      ))}
    </span>
  )
}
