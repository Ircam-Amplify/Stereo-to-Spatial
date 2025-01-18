class SessionStore {
  private sessions: Map<string, { 
    fileId: string; 
    iasUrl: string;
    zipPath?: string;
    zipSize?: number;
  }>;

  constructor() {
    this.sessions = new Map();
  }

  saveSession(sessionId: string, data: { fileId: string; iasUrl: string; zipPath?: string; zipSize?: number }) {
    this.sessions.set(sessionId, data);
    console.log("\n=== Saved session data in memory ===");
    console.log(`Session ID: ${sessionId}`);
    console.log("IRCAM data:", data);
  }

  updateSession(sessionId: string, data: Partial<{ fileId: string; iasUrl: string; zipPath: string; zipSize: number }>) {
    const currentData = this.sessions.get(sessionId);
    if (currentData) {
      this.sessions.set(sessionId, { ...currentData, ...data });
      console.log("\n=== Updated session data in memory ===");
      console.log(`Session ID: ${sessionId}`);
      console.log("Updated data:", data);
    }
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  getLatestSession() {
    const entries = Array.from(this.sessions.entries());
    if (entries.length === 0) return null;

    // Return the last added session
    const [sessionId, data] = entries[entries.length - 1];
    return { sessionId, data };
  }
}

// Export a singleton instance
export const sessionStore = new SessionStore();