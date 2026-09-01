export async function functionErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (payload && typeof payload.error === "string") return payload.error;
      if (payload && typeof payload.detail === "string") return payload.detail;
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Fall through to the SDK error below.
      }
    }
  }
  return (error as { message?: string } | null)?.message || fallback;
}
