// Module-level cache for mini-game settings (populated by preload from GameBoard)
let _cachedMiniGameRules = null
let _cachedCustomMiniGames = null
let _cachedSponsorLogo = null
let _settingsPreloaded = false
let _settingsPreloadPromise = null

export const preloadMiniGameSettings = async (getAppSettings) => {
  if (_settingsPreloaded) return
  if (_settingsPreloadPromise) return _settingsPreloadPromise

  _settingsPreloadPromise = (async () => {
    try {
      const settings = await getAppSettings()
      if (settings?.miniGameRules) _cachedMiniGameRules = settings.miniGameRules
      if (settings?.customMiniGames) _cachedCustomMiniGames = settings.customMiniGames
      if (settings?.sponsorLogo) _cachedSponsorLogo = settings.sponsorLogo
      _settingsPreloaded = true
    } catch (e) {
      // ignore - component will load as fallback
    }
  })()

  return _settingsPreloadPromise
}

export const getCachedMiniGameRules = () => _cachedMiniGameRules
export const getCachedCustomMiniGames = () => _cachedCustomMiniGames
export const getCachedSponsorLogo = () => _cachedSponsorLogo
export const isMiniGameSettingsPreloaded = () => _settingsPreloaded
