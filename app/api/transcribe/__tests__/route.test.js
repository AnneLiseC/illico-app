import { describe, it, expect } from 'vitest'
import { formatTranscript } from '../route.js'

describe('formatTranscript', () => {
  it('met en forme les tours de parole (diarisation)', () => {
    const dg = { results: { utterances: [
      { speaker: 0, transcript: 'Bonjour, on regarde la salle de bain.' },
      { speaker: 1, transcript: 'Oui, le carrelage est à refaire.' },
      { speaker: 0, transcript: 'On prévoit aussi la plomberie.' },
    ] } }
    expect(formatTranscript(dg)).toBe(
      'Interlocuteur 1 : Bonjour, on regarde la salle de bain.\n' +
      'Interlocuteur 2 : Oui, le carrelage est à refaire.\n' +
      'Interlocuteur 1 : On prévoit aussi la plomberie.'
    )
  })

  it('retombe sur le transcript brut sans diarisation', () => {
    const dg = { results: { channels: [{ alternatives: [{ transcript: 'texte simple' }] }] } }
    expect(formatTranscript(dg)).toBe('texte simple')
  })

  it('gère speaker absent (défaut interlocuteur 1)', () => {
    const dg = { results: { utterances: [{ transcript: 'sans speaker' }] } }
    expect(formatTranscript(dg)).toBe('Interlocuteur 1 : sans speaker')
  })

  it('retourne une chaîne vide si rien d’exploitable', () => {
    expect(formatTranscript({})).toBe('')
    expect(formatTranscript({ results: {} })).toBe('')
  })
})
