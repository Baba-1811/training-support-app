import "server-only";
export function appUrl() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && (!process.env.APP_URL || url.protocol !== "https:")) {
    throw new Error("APP_URL must be an HTTPS URL in production");
  }
  return url.origin;
}
