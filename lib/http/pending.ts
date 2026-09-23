/* Placeholder response for integration routes whose contract PINCH hasn't confirmed yet
   (docs/jobRUN_PINCH_Product_Document_Beta_0.1.docx §10). Logs the payload so the shape can be captured. */
export async function notImplemented(route: string, req: Request, todo: string) {
  const body = await req.text().catch(() => "");
  console.warn(`[${route}] not implemented — ${todo}`, body.slice(0, 2000));
  return Response.json({ ok: false, route, todo }, { status: 501 });
}
