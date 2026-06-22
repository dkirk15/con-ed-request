import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setImpersonatedRole as setFetchRole } from "@workspace/api-client-react";

export type ImpersonableRole = "employee" | "manager" | "business_office" | "accounting";

const STORAGE_KEY = "oss_impersonated_role";

interface ImpersonationContextValue {
  impersonatedRole: ImpersonableRole | null;
  setImpersonatedRole: (role: ImpersonableRole | null) => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonatedRole: null,
  setImpersonatedRole: () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [impersonatedRole, _set] = useState<ImpersonableRole | null>(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY) as ImpersonableRole | null;
    setFetchRole(stored);
    return stored;
  });

  const setImpersonatedRole = useCallback(
    (role: ImpersonableRole | null) => {
      _set(role);
      setFetchRole(role);
      if (role) {
        sessionStorage.setItem(STORAGE_KEY, role);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
      // clear() wipes ALL cached data AND ETags so the next fetch is
      // a fresh request without If-None-Match, guaranteeing the server
      // returns the impersonated role instead of a 304 Not Modified.
      queryClient.clear();
    },
    [queryClient],
  );

  return (
    <ImpersonationContext.Provider value={{ impersonatedRole, setImpersonatedRole }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
