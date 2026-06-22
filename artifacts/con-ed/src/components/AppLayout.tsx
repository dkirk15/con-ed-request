import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Home, FileText, Users, UserCircle, LogOut } from "lucide-react";
import logo from "@assets/oss-logo-white.png";
import ImpersonationBanner from "@/components/ImpersonationBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const { signOut } = useClerk();
  const [location] = useLocation();

  if (!user) return <>{children}</>;

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : "?";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
        <Sidebar className="border-r border-sidebar-border shadow-sm">
          <SidebarHeader className="p-4 bg-sidebar">
            <div className="flex items-center gap-3">
              <img src={logo} alt="OSS Logo" className="h-8 object-contain" />
              <div className="flex flex-col">
                <span className="font-serif font-bold text-sidebar-foreground text-sm leading-tight">Olympic Sports</span>
                <span className="font-serif font-bold text-sidebar-foreground text-sm leading-tight">& Spine</span>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-2 gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard" className="flex items-center gap-3 w-full">
                    <Home className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/requests")}>
                  <Link href="/requests" className="flex items-center gap-3 w-full">
                    <FileText className="h-4 w-4" />
                    <span>Requests</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {(user.role === "admin" || user.role === "manager") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/users")}>
                    <Link href="/users" className="flex items-center gap-3 w-full">
                      <Users className="h-4 w-4" />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/account"}>
                  <Link href="/account" className="flex items-center gap-3 w-full">
                    <UserCircle className="h-4 w-4" />
                    <span>My Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => signOut()}
                  className="flex items-center gap-3 w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <div className="mt-4 flex items-center gap-3 px-2 py-1">
              <Avatar className="h-8 w-8 rounded bg-primary text-primary-foreground border border-primary/20">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col truncate">
                <span className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</span>
                <span className="text-xs text-sidebar-foreground/70 truncate capitalize">{user.role.replace("_", " ")}</span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-14 border-b bg-white flex items-center px-4 md:hidden">
            <SidebarTrigger />
            <span className="ml-4 font-serif font-bold text-primary">OSS Con-Ed</span>
          </header>
          <ImpersonationBanner />
          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
