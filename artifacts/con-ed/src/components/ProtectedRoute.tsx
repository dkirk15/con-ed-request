import { SignedIn, SignedOut, RedirectToSignIn, useClerk } from "@clerk/clerk-react";
import { useGetMe } from "@workspace/api-client-react";
import { ReactNode, useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return (
    <>
      <SignedIn>
        <AuthenticatedUserWrapper>{children}</AuthenticatedUserWrapper>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function AuthenticatedUserWrapper({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe();
  const { signOut } = useClerk();

  const is401 = (error as any)?.response?.status === 401 || (error as any)?.status === 401;

  useEffect(() => {
    if (is401) {
      signOut();
    }
  }, [is401, signOut]);

  if (isLoading || is401) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8" />
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
