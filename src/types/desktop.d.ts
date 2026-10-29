// What the desktop (Electron) shell exposes to the page through its preload script. Absent in a browser.
export interface DesktopBridge {
  /** True inside the desktop app. */
  desktop: true;
  platform: string;
  version: string;
  backup: {
    /** The folder automatic backups go to, or null when none has been chosen. */
    folder(): Promise<string | null>;
    /** Let the person pick the folder (native dialog). Resolves to the chosen folder, or null if cancelled. */
    chooseFolder(): Promise<string | null>;
    /** Write a backup file into the chosen folder and keep only the newest `keep` automatic backups. */
    write(name: string, text: string, keep: number): Promise<{ folder: string; removed: string[] }>;
    /** Open the folder in the system file manager. */
    reveal(): Promise<void>;
  };
}
declare global {
  interface Window {
    kibitz?: DesktopBridge;
  }
}
