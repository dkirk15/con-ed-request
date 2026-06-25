import { Show, useClerk } from "@clerk/react";
import { Redirect } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return (
    <>
      <Show when="signed-in">
        <AuthenticatedUserWrapper>{children}</AuthenticatedUserWrapper>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AuthenticatedUserWrapper({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  const is401 = (error as any)?.status === 401;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (is401) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Session Expired</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>Your session has expired. Please sign in again.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.clear();
                signOut();
              }}
            >
              Sign in again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            Could not load your user profile. Please ensure you have been properly provisioned in the system.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
