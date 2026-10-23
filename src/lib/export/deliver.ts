// Hands an exported file to the user: the OS share sheet where it helps, a download otherwise.
// `save` takes the share sheet only on phones and tablets (a download on iOS lands in Files, not
// Photos); `share` takes it wherever the browser can share files.

export type DeliverIntent = 'save' | 'share'
export type DeliverOutcome = 'shared' | 'downloaded' | 'cancelled'

export interface DeviceSignals {
  // `navigator.userAgentData.mobile` / `.platform`; undefined where the API is missing (Safari, Firefox).
  uaMobile: boolean | undefined
  uaPlatform: string | undefined
  userAgent: string
  maxTouchPoints: number
  coarsePointer: boolean
}

// Platform signals first; the coarse-pointer media query only decides when they can't.
export function isHandheld(s: DeviceSignals): boolean {
  // Android tablets report `mobile: false` (no "Mobile" UA token) but still want the share sheet.
  if (s.uaMobile !== undefined)
    return s.uaMobile || s.uaPlatform === 'Android'
  if (/iPhone|iPad|iPod/.test(s.userAgent))
    return true
  // iPadOS asks for the desktop site by default and reports a Mac UA; only touch gives it away.
  if (/Macintosh/.test(s.userAgent) && s.maxTouchPoints > 1)
    return true
  return s.coarsePointer
}

export function prefersShareSheet(intent: DeliverIntent, canShareFiles: boolean, device: DeviceSignals): boolean {
  if (!canShareFiles)
    return false
  return intent === 'share' || isHandheld(device)
}

function deviceSignals(): DeviceSignals {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile: boolean, platform: string } }).userAgentData
  return {
    uaMobile: uaData?.mobile,
    uaPlatform: uaData?.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
  }
}

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  }
  catch {
    return false
  }
}

// Long enough for the browser to start the download before the object URL goes away.
const REVOKE_AFTER_MS = 10_000

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(URL.revokeObjectURL, REVOKE_AFTER_MS, url)
}

export async function deliverFile(blob: Blob, filename: string, intent: DeliverIntent): Promise<DeliverOutcome> {
  const file = new File([blob], filename, { type: blob.type })
  if (prefersShareSheet(intent, canShareFile(file), deviceSignals())) {
    try {
      // Files plus a title only: some share targets drop the file when a URL rides along.
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
    catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError')
        return 'cancelled'
      // Anything else (lost user activation, a target refusing the file) falls back to a download.
    }
  }
  download(blob, filename)
  return 'downloaded'
}
