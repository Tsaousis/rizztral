import { spriteGrid } from './PixelSprite.jsx'

const loadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })

function drawSprite(g, id, x, y, scale) {
  const { grid, colors } = spriteGrid(id, 'closed', id === 'clarissa' ? 'love' : null)
  g.fillStyle = 'rgba(20, 8, 41, .55)'
  grid.forEach((row, ry) => row.forEach((c, rx) => c !== '.' && colors[c] && g.fillRect(x + (rx + 1) * scale, y + (ry + 1) * scale, scale, scale)))
  grid.forEach((row, ry) =>
    row.forEach((c, rx) => {
      if (c === '.' || !colors[c]) return
      g.fillStyle = colors[c]
      g.fillRect(x + rx * scale, y + ry * scale, scale, scale)
    }),
  )
}

function heart(g, x, y, size, fill) {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
  g.fillStyle = fill
  rows.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && g.fillRect(x + rx * size, y + ry * size, size, size)))
}

export async function renderShareCard({ name, score, max, won, winnerId, winnerName, beaten }) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const g = canvas.getContext('2d')
  g.imageSmoothingEnabled = false
  await Promise.all([
    document.fonts?.load('700 64px "Pixelify Sans"'),
    document.fonts?.load('700 32px "DM Sans"'),
  ]).catch(() => {})
  const bg = await loadImage('/img/villa-pixel.webp')
  if (bg) {
    const ratio = Math.max(1200 / bg.width, 630 / bg.height)
    g.drawImage(bg, (1200 - bg.width * ratio) / 2, (630 - bg.height * ratio) / 2, bg.width * ratio, bg.height * ratio)
  }
  g.fillStyle = 'rgba(20, 8, 41, .62)'
  g.fillRect(0, 0, 1200, 630)
  g.strokeStyle = '#ff2f91'
  g.lineWidth = 16
  g.strokeRect(8, 8, 1184, 614)

  drawSprite(g, won ? 'player' : winnerId, 70, 130, 14)

  const pixel = '"Pixelify Sans", "DM Sans", sans-serif'
  g.textBaseline = 'top'
  g.fillStyle = '#47eaff'
  g.font = `700 34px ${pixel}`
  g.fillText('★ RIZZTRAL ★', 470, 70)
  g.fillStyle = '#fff1d6'
  g.font = `700 60px ${pixel}`
  const headline = won ? `${name} GOT THE ROSE` : `${winnerName.toUpperCase()} STOLE THE ROSE`
  g.fillText(headline, 470, 130, 680)
  g.fillStyle = '#ffb347'
  g.font = `800 150px "DM Sans", sans-serif`
  g.fillText(`${score}/${max}`, 466, 210)
  g.fillStyle = '#fff1d6'
  g.font = '700 40px "DM Sans", sans-serif'
  g.fillText(beaten ? `Out-rizzed ${beaten} of 2 AIs` : 'The machines won this time', 470, 390, 680)
  const hearts = Math.round((score / max) * 10)
  for (let i = 0; i < 10; i += 1) heart(g, 470 + i * 62, 456, 7, i < hearts ? '#ff2f91' : 'rgba(255, 255, 255, .2)')
  g.fillStyle = '#47eaff'
  g.font = `700 30px ${pixel}`
  g.fillText('Can you out-rizz the machines?', 470, 534)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return { blob, url: URL.createObjectURL(blob) }
}
