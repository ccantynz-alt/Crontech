import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const errorRate = new Rate("errors");
const registerOptionsDuration = new Trend("register_options_duration", true);
const loginOptionsDuration = new Trend("login_options_duration", true);

export const options = {
  stages: [
    { duration: "15s", target: 5 },
    { duration: "30s", target: 10 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
    register_options_duration: ["p(95)<500"],
    login_options_duration: ["p(95)<500"],
  },
};

export default function () {
  // Test 1: Register options endpoint (WebAuthn registration challenge)
  const registerRes = http.post(
    `${BASE_URL}/api/auth/register/options`,
    JSON.stringify({
      username: `loadtest-user-${__VU}-${__ITER}`,
      displayName: `Load Test User ${__VU}`,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
  registerOptionsDuration.add(registerRes.timings.duration);
  check(registerRes, {
    "register options status is 200": (r) => r.status === 200,
    "register options returns challenge": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.challenge !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(registerRes.status !== 200);

  sleep(2);

  // Test 2: Login options endpoint (WebAuthn authentication challenge)
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login/options`,
    JSON.stringify({
      username: `loadtest-user-${__VU}-${__ITER}`,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
  loginOptionsDuration.add(loginRes.timings.duration);
  check(loginRes, {
    "login options status is 200 or 404": (r) =>
      r.status === 200 || r.status === 404,
    "login options returns valid response": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(loginRes.status !== 200 && loginRes.status !== 404);

  sleep(2);
}
