import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const errorRate = new Rate("errors");
const healthDuration = new Trend("health_duration", true);
const trpcDuration = new Trend("trpc_user_list_duration", true);
const sseDuration = new Trend("sse_connect_duration", true);

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
    health_duration: ["p(95)<100"],
    trpc_user_list_duration: ["p(95)<200"],
    sse_connect_duration: ["p(95)<200"],
  },
};

export default function () {
  // Test 1: Health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  healthDuration.add(healthRes.timings.duration);
  check(healthRes, {
    "health status is 200": (r) => r.status === 200,
    "health response has status field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(healthRes.status !== 200);

  sleep(0.5);

  // Test 2: tRPC user list endpoint
  const trpcRes = http.get(`${BASE_URL}/api/trpc/user.list`, {
    headers: { "Content-Type": "application/json" },
  });
  trpcDuration.add(trpcRes.timings.duration);
  check(trpcRes, {
    "trpc user list status is 200": (r) => r.status === 200,
    "trpc response is valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(trpcRes.status !== 200);

  sleep(0.5);

  // Test 3: SSE endpoint (connect and read initial data)
  const sseRes = http.get(`${BASE_URL}/api/sse`, {
    headers: { Accept: "text/event-stream" },
    timeout: "5s",
  });
  sseDuration.add(sseRes.timings.duration);
  check(sseRes, {
    "sse status is 200": (r) => r.status === 200,
    "sse content-type is event-stream": (r) =>
      r.headers["Content-Type"] &&
      r.headers["Content-Type"].includes("text/event-stream"),
  });
  errorRate.add(sseRes.status !== 200);

  sleep(1);
}
