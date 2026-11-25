export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(200).json({
    ok: true,
    service: "ellalexi-ai",
    stage: "foundation",
    timestamp: new Date().toISOString(),
  });
}
