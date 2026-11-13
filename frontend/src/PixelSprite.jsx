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

const OUTLINE = '#2a0e4a'
const COMMON = { o: OUTLINE, w: '#ffffff', e: OUTLINE }

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

function compose(id, mouth) {
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

const FRAMES = Object.fromEntries(
  Object.keys(SPRITES).map((id) => [id, Object.fromEntries(Object.keys(MOUTHS).map((m) => [m, compose(id, m)]))]),
)

export default function PixelSprite({ id, talking = false, className = '', label }) {
  return (
    <span className={`pixel-sprite sprite-${id} ${talking ? 'is-talking' : ''} ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Object.entries(FRAMES[id]).map(([mouth, rects]) => (
        <svg key={mouth} className={`frame frame-${mouth}`} viewBox={`0 0 ${W} ${BASE.length}`} shapeRendering="crispEdges">
          {rects}
        </svg>
      ))}
    </span>
  )
}
