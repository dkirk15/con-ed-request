import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import DashboardPage from "@/pages/DashboardPage";
import RequestsPage from "@/pages/RequestsPage";
import ApprovalWorkspacePage from "@/pages/ApprovalWorkspacePage";
import AccountPage from "@/pages/AccountPage";
import NewRequestPage from "@/pages/NewRequestPage";
import RequestDetailPage from "@/pages/RequestDetailPage";
import UsersPage from "@/pages/UsersPage";
import UserDetailPage from "@/pages/UserDetailPage";
import ClinicsPage from "@/pages/ClinicsPage";
import NotFound from "@/pages/not-found";

import AppLayout from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ImpersonationProvider } from "@/context/ImpersonationContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Resolves the key from window.location.hostname so one build can serve multiple
// Clerk domains; the env var is the fallback. Do not inline the raw env var.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in dev (Clerk hits dev FAPI directly), auto-set in prod. Passed to
// ClerkProvider unconditionally — gating it on PROD/NODE_ENV breaks the prod proxy.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk hands full paths (including the base) to routerPush/routerReplace, but
// wouter's setLocation re-applies the base — strip it first to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function ProtectedRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/requests/new" component={NewRequestPage} />
        <Route path="/approvals" component={ApprovalWorkspacePage} />
        <Route path="/requests/:id/edit" component={NewRequestPage} />
        <Route path="/requests/:id" component={RequestDetailPage} />
        <Route path="/requests" component={RequestsPage} />
        <Route path="/users/:id" component={UserDetailPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/clinics" component={ClinicsPage} />
        <Route path="/account" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      {/* "/sign-in/*?" and "/sign-up/*?" — the /*? optional wildcard matches both
          the bare URL and Clerk's OAuth sub-paths (sso-callback, factor-one). */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/">
        <Redirect to="/sign-in" />
      </Route>
      <Route path="/(.*)">
        <ProtectedRoute>
          <ProtectedRouter />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

/**
 * Registers Clerk's getToken() as the Bearer token provider for every API
 * fetch call. Must live inside <ClerkProvider>.
 * Runs synchronously during render (not useEffect) so the getter is in place
 * before any React Query hook fires its first request.
 */
function ClerkTokenSync() {
  const { getToken } = useAuth();
  // Intentional synchronous side-effect during render — setAuthTokenGetter
  // only writes a module-level variable and never triggers a re-render.
  setAuthTokenGetter(() => getToken());
  return null;
}

function ClerkWithRouter({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkTokenSync />
      {children}
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 text-red-500">
        Missing VITE_CLERK_PUBLISHABLE_KEY
      </div>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <ClerkWithRouter publishableKey={clerkPubKey}>
        <QueryClientProvider client={queryClient}>
          <ImpersonationProvider>
            <TooltipProvider>
              <AppRoutes />
              <Toaster />
            </TooltipProvider>
          </ImpersonationProvider>
        </QueryClientProvider>
      </ClerkWithRouter>
    </WouterRouter>
  );
}

export default App;
