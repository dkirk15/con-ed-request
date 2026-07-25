import { type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  getGetTaskCenterQueryKey,
  useGetMe,
  useGetTaskCenter,
} from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import {
  Building2,
  BarChart3,
  ClipboardCheck,
  FilePlus2,
  Files,
  History,
  Home,
  LogOut,
  ReceiptText,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
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
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logo from "@assets/oss-logo-white.png";
import ImpersonationBanner from "@/components/ImpersonationBanner";

type Role = "employee" | "manager" | "business_office" | "accounting" | "admin";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  path: string;
  query?: Record<string, string>;
  exactQuery?: boolean;
  badge?: "myRequests" | "approvals" | "reimbursements" | "reports";
}

const NAV_ITEMS: Record<Role, NavItem[]> = {
  employee: [
    { label: "Overview", href: "/dashboard", icon: Home, path: "/dashboard" },
    { label: "My Requests", href: "/requests", icon: Files, path: "/requests", exactQuery: true, badge: "myRequests" },
    { label: "New Request", href: "/requests/new", icon: FilePlus2, path: "/requests/new" },
  ],
  manager: [
    { label: "Overview", href: "/dashboard", icon: Home, path: "/dashboard" },
    {
      label: "Approvals",
      href: "/approvals",
      icon: ClipboardCheck,
      path: "/approvals",
      badge: "approvals",
    },
    {
      label: "My Requests",
      href: "/requests?scope=mine",
      icon: Files,
      path: "/requests",
      query: { scope: "mine" },
      badge: "myRequests",
    },
    { label: "Team", href: "/users", icon: Users, path: "/users" },
    { label: "Reports", href: "/reports", icon: BarChart3, path: "/reports" },
  ],
  business_office: [
    { label: "Overview", href: "/dashboard", icon: Home, path: "/dashboard" },
    {
      label: "CE Approvals",
      href: "/approvals",
      icon: ClipboardCheck,
      path: "/approvals",
      badge: "approvals",
    },
    { label: "All Requests", href: "/requests", icon: Files, path: "/requests", exactQuery: true },
    { label: "Reports", href: "/reports", icon: BarChart3, path: "/reports" },
  ],
  accounting: [
    { label: "Overview", href: "/dashboard", icon: Home, path: "/dashboard" },
    {
      label: "Reimbursements",
      href: "/reimbursements",
      icon: ReceiptText,
      path: "/reimbursements",
      badge: "reimbursements",
    },
    {
      label: "History",
      href: "/requests?status=reimbursed",
      icon: History,
      path: "/requests",
      query: { status: "reimbursed" },
    },
    { label: "Reports", href: "/reports", icon: BarChart3, path: "/reports" },
  ],
  admin: [
    { label: "Operations", href: "/dashboard", icon: Home, path: "/dashboard" },
    { label: "All Requests", href: "/requests", icon: Files, path: "/requests", exactQuery: true },
    { label: "Reports", href: "/reports", icon: BarChart3, path: "/reports", badge: "reports" },
    { label: "People", href: "/users", icon: Users, path: "/users" },
    { label: "Clinics", href: "/clinics", icon: Building2, path: "/clinics" },
  ],
};

function isNavItemActive(
  item: NavItem,
  location: string,
  searchParams: URLSearchParams,
): boolean {
  const pathMatches =
    item.path === "/requests"
      ? location === item.path || /^\/requests\/\d+$/.test(location)
      : item.path === "/users"
        ? location === item.path || location.startsWith("/users/")
      : location === item.path || location.startsWith(`${item.path}/`);
  if (!pathMatches) return false;
  if (item.query) {
    return Object.entries(item.query).every(([key, value]) => searchParams.get(key) === value);
  }
  if (item.exactQuery) {
    return !searchParams.has("status") && !searchParams.has("scope");
  }
  return true;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: user } = useGetMe();
  const { data: taskCenter } = useGetTaskCenter({
    query: {
      enabled: Boolean(user),
      queryKey: getGetTaskCenterQueryKey(),
    },
  });
  const { signOut } = useClerk();
  const [location] = useLocation();
  const search = useSearch();

  if (!user) return <>{children}</>;

  const role = user.role as Role;
  const searchParams = new URLSearchParams(search);
  const initials = user.name
    ? user.name
        .split(" ")
        .map((name) => name[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "?";

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow focus:translate-y-0"
      >
        Skip to Main Content
      </a>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50">
        <Sidebar className="border-r border-sidebar-border">
          <SidebarHeader className="border-b border-sidebar-border bg-sidebar px-4 py-5">
            <Link href="/dashboard" className="flex items-center gap-3">
              <img
                src={logo}
                alt="Olympic Sports & Spine"
                width={96}
                height={32}
                className="h-8 w-auto object-contain"
              />
              <div className="border-l border-white/20 pl-3">
                <div className="font-serif text-sm font-bold leading-tight text-sidebar-foreground">
                  CE Portal
                </div>
                <div className="mt-0.5 text-[11px] text-sidebar-foreground/60">
                  Funding & Reimbursement
                </div>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="bg-sidebar p-2">
            <div className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Workspace
            </div>
            <SidebarMenu>
              {NAV_ITEMS[role].map((item) => {
                const Icon = item.icon;
                const badgeCount = item.badge
                  ? taskCenter?.navigationCounts[item.badge] ?? 0
                  : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(item, location, searchParams)}
                    >
                      <Link href={item.href} className="flex w-full items-center gap-3">
                        <Icon aria-hidden="true" className="h-4 w-4" />
                        <span>{item.label}</span>
                        {badgeCount > 0 ? (
                          <span
                            className="ml-auto min-w-5 rounded bg-white/15 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-sidebar-foreground"
                            aria-label={`${badgeCount} items need attention`}
                          >
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/account"}>
                  <Link href="/account" className="flex w-full items-center gap-3">
                    <UserCircle aria-hidden="true" className="h-4 w-4" />
                    <span>My Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-3 text-sidebar-foreground/70 hover:bg-red-950/20 hover:text-red-300"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <div className="mt-3 flex min-w-0 items-center gap-3 border-t border-sidebar-border px-2 pt-3">
              <Avatar className="h-8 w-8 shrink-0 rounded bg-primary text-primary-foreground">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-sidebar-foreground">{user.name}</div>
                <div className="truncate text-xs capitalize text-sidebar-foreground/60">
                  {user.role.replace("_", " ")}
                </div>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main id="main-content" className="flex h-screen flex-1 flex-col overflow-hidden" tabIndex={-1}>
          <header className="flex h-14 items-center border-b bg-white px-4 md:hidden">
            <SidebarTrigger aria-label="Open navigation" />
            <span className="ml-4 font-serif font-bold text-secondary">OSS CE Portal</span>
          </header>
          <ImpersonationBanner />
          <div className="flex-1 overflow-auto p-5 md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
