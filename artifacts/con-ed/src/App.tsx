import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/clerk-react";

import SignInPage from "@/pages/SignInPage";
import DashboardPage from "@/pages/DashboardPage";
import RequestsPage from "@/pages/RequestsPage";
import AccountPage from "@/pages/AccountPage";
import NewRequestPage from "@/pages/NewRequestPage";
import RequestDetailPage from "@/pages/RequestDetailPage";
import UsersPage from "@/pages/UsersPage";
import UserDetailPage from "@/pages/UserDetailPage";
import NotFound from "@/pages/not-found";

import AppLayout from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/requests" component={RequestsPage} />
        <Route path="/account" component={AccountPage} />
        {/* TODO: Add NewRequestPage, RequestDetailPage, UsersPage, UserDetailPage */}
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SignInPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignInPage} />
      <Route path="/(.*)">
        <ProtectedRoute>
          <ProtectedRouter />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!clerkPubKey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 text-red-500">
        Missing VITE_CLERK_PUBLISHABLE_KEY
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
