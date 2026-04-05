import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { AuthProvider, ThemeProvider, FeatureFlagProvider } from "./stores";
import { Layout } from "./components/Layout";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Back to the Future</Title>
          <ThemeProvider>
            <AuthProvider>
              <FeatureFlagProvider>
                <AppErrorBoundary>
                  <Layout>
                    <Suspense>{props.children}</Suspense>
                  </Layout>
                </AppErrorBoundary>
              </FeatureFlagProvider>
            </AuthProvider>
          </ThemeProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
