/* Which live map layers the server can serve; the client simulates the rest (INTEGRATION.md §6). */
export function GET() {
  return Response.json({
    traffic: !!process.env.TOMTOM_TRAFFIC_KEY,
    weather: !!process.env.OPENWEATHER_KEY,
  });
}
