// Screen WakeLock Manager to prevent device sleep during live timing sessions

class WakeLockManager {
  private wakeLock: any = null;
  private isSupported: boolean = false;
  private isActive: boolean = false;

  constructor() {
    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      this.isSupported = true;
    }
  }

  public getSupported(): boolean {
    return this.isSupported;
  }

  public getActive(): boolean {
    return this.isActive;
  }

  public async requestLock(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      this.wakeLock = await (navigator as any).wakeLock.request("screen");
      this.isActive = true;

      this.wakeLock.addEventListener("release", () => {
        this.isActive = false;
      });

      return true;
    } catch {
      this.isActive = false;
      return false;
    }
  }

  public async releaseLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
      this.isActive = false;
    }
  }
}

export const wakeLockManager = new WakeLockManager();

