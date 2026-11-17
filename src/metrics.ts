import { onCLS, onINP, onLCP, type Metric } from "web-vitals";
const initialRoute = location.hash.slice(1) || "/";
function report(metric: Metric) {
  void fetch("/api/metrics", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json", "X-Lab-Request": "1" },
    body: JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      route: initialRoute,
      viewport: `${innerWidth}x${innerHeight}`,
      browser: navigator.userAgent,
      network:
        (navigator as Navigator & { connection?: { effectiveType?: string } })
          .connection?.effectiveType || "unknown",
      at: new Date().toISOString(),
    }),
  }).catch(() => {});
}
onCLS(report);
onLCP(report);
onINP(report);
