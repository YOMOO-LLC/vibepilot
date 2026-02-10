import { mkdir } from 'fs/promises';
import { join } from 'path';

export class BrowserProfileManager {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async getProfilePath(projectId: string): Promise<string> {
    const profilePath = join(this.basePath, projectId);
    await mkdir(profilePath, { recursive: true });
    return profilePath;
  }
}
