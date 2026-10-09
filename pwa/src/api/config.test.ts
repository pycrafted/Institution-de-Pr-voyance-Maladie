import { describe, expect, it, vi } from 'vitest'

import { chargerConfig, CONFIG_PAR_DEFAUT, normaliserConfig } from './config'

describe('normaliserConfig', () => {
  it('retire les « / » finaux et les espaces', () => {
    expect(normaliserConfig({ apiBase: ' https://sar-integration.sar.sn/api/ ' })).toEqual({
      apiBase: 'https://sar-integration.sar.sn/api',
    })
  })

  it.each([null, 42, {}, { apiBase: '' }, { apiBase: 3 }])('repli par défaut pour %j', (brut) => {
    expect(normaliserConfig(brut)).toEqual(CONFIG_PAR_DEFAUT)
  })
})

describe('chargerConfig', () => {
  it('lit /config.json sans cache HTTP', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ apiBase: 'https://x.sn/api' }), { status: 200 }),
      )
    await expect(chargerConfig(fetchMock)).resolves.toEqual({ apiBase: 'https://x.sn/api' })
    expect(fetchMock).toHaveBeenCalledWith('/config.json', { cache: 'no-cache' })
  })

  it('se rabat sur /api si le fichier manque ou le réseau échoue', async () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      chargerConfig(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))),
    ).resolves.toEqual(CONFIG_PAR_DEFAUT)
    await expect(
      chargerConfig(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('hors ligne'))),
    ).resolves.toEqual(CONFIG_PAR_DEFAUT)
    avertir.mockRestore()
  })
})
