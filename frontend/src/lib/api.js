async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = `The studio lost signal (${res.status}).`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      /* not JSON */
    }
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  config: () => request('/config'),
  leaderboard: (limit = 8) => request(`/leaderboard?limit=${limit}`),
  start: (playerName) => request('/games', { method: 'POST', body: { player_name: playerName } }),
  prepare: (gameId, round) => request(`/games/${gameId}/rounds/${round}/prepare`, { method: 'POST' }),
  answer: (gameId, round, answer) =>
    request(`/games/${gameId}/rounds/${round}/answer`, { method: 'POST', body: { answer } }),
  verdict: (gameId) => request(`/games/${gameId}/verdict`, { method: 'POST' }),
}
