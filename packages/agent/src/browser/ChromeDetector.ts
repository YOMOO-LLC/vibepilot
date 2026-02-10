import { access } from 'fs/promises';

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
};

export class ChromeDetector {
  static getPlatformPaths(): string[] {
    return CHROME_PATHS[process.platform] ?? [];
  }

  static async detect(): Promise<string | null> {
    const paths = this.getPlatformPaths();
    for (const p of paths) {
      try {
        await access(p);
        return p;
      } catch {
        // not found, try next
      }
    }
    return null;
  }
}
