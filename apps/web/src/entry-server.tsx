// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";

const speculationRules = JSON.stringify({
  prerender: [
    {
      urls: ["/dashboard", "/builder", "/about"],
      eagerness: "eager",
    },
  ],
  prefetch: [
    {
      urls: ["/login", "/register"],
      eagerness: "moderate",
    },
  ],
});

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <meta name="color-scheme" content="light dark" />
          <meta name="theme-color" content="#2563eb" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta http-equiv="X-DNS-Prefetch-Control" content="on" />
          <link rel="preconnect" href="http://localhost:3001" />
          <link rel="dns-prefetch" href="http://localhost:3001" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="manifest" href="/manifest.json" />
          <script
            type="speculationrules"
            innerHTML={speculationRules}
          />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
