type PlatformNavigator = Navigator & { userAgentData?: { platform?: string } }

let cachedPlatform: string | null = null
let cachedIsMac = false

export function isMacPlatform(): boolean {
  const platform = (navigator as PlatformNavigator).userAgentData?.platform || navigator.platform
  if (platform !== cachedPlatform) {
    cachedPlatform = platform
    cachedIsMac = platform.toLowerCase().includes('mac')
  }
  return cachedIsMac
}
