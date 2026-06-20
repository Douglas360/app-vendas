"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  CreditCard,
  Receipt,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
  Store,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

const NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "PDV",
    href: "/dashboard/pdv",
    icon: ShoppingCart,
  },
  {
    title: "Produtos",
    href: "/dashboard/produtos",
    icon: Package,
  },
  {
    title: "Clientes",
    href: "/dashboard/clientes",
    icon: Users,
  },
  {
    title: "Vendas",
    href: "/dashboard/vendas",
    icon: Receipt,
  },
  {
    title: "Fiado",
    href: "/dashboard/fiado",
    icon: CreditCard,
  },
];

const BOTTOM_NAV_ITEMS = [
  {
    title: "Configurações",
    href: "/dashboard/configuracoes",
    icon: Settings,
  },
];

function NavItem({
  item,
  isActive,
  collapsed,
}: {
  item: (typeof NAV_ITEMS)[0];
  isActive: boolean;
  collapsed?: boolean;
}) {
  const content = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        "hover:bg-accent/80",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          : "text-muted-foreground hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <item.icon className={cn("h-4.5 w-4.5 shrink-0", collapsed && "h-5 w-5")} />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "??";

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center border-b px-4",
          collapsed && "justify-center px-2"
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
            <Store className="h-4.5 w-4.5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight">
                VendaFácil
              </span>
              <span className="text-[10px] leading-none text-muted-foreground">
                Gestão de Vendas
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom */}
      <div className="border-t px-3 py-3">
        <nav className="flex flex-col gap-1 mb-3">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <Separator className="mb-3" />

        {/* Theme Toggle */}
        <div className={cn("flex mb-3", collapsed ? "justify-center" : "px-1")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-8 w-8"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Alternar tema</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"}>
              Alternar tema
            </TooltipContent>
          </Tooltip>
        </div>

        {/* User */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2",
            collapsed && "justify-center px-0"
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">
                {profile?.full_name}
              </span>
              <span className="truncate text-xs text-muted-foreground capitalize">
                {profile?.role}
              </span>
            </div>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className={cn("h-8 w-8 shrink-0", collapsed && "mt-2")}
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sair</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"}>
              Sair
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger */}
      <div className="fixed left-4 top-4 z-50 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl shadow-lg backdrop-blur-sm bg-background/80"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-screen w-64 flex-col border-r bg-card/50 backdrop-blur-sm sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
