"use client";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/logo";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/api";
import {
	Avatar,
	AvatarFallback,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	CircleUserRoundIcon,
	BellIcon,
	LogOutIcon,
	LayoutDashboardIcon,
	ChevronDownIcon,
} from "lucide-react";

export const navLinks = [
	{ label: "Features", href: "/#features" },
	{ label: "Pricing", href: "/pricing" },
	{ label: "Contact", href: "/contact" },
];

function getInitials(name: string) {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function HeaderUserMenu({ user, scrolled }: { user: AuthUser; scrolled: boolean }) {
	const router = useRouter();

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
		router.push("/");
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					className={cn(
						"gap-2",
						!scrolled && "text-white/80 hover:bg-white/10 hover:text-white"
					)}
				>
					<Avatar className="h-6 w-6 rounded-full">
						<AvatarFallback className="rounded-full text-xs">
							{getInitials(user.name)}
						</AvatarFallback>
					</Avatar>
					<span className="max-w-24 truncate text-sm">{user.name.split(" ")[0]}</span>
					<ChevronDownIcon className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56 rounded-lg" align="end" sideOffset={8}>
				<DropdownMenuLabel className="p-0 font-normal">
					<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarFallback className="rounded-lg">
								{getInitials(user.name)}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{user.name}</span>
							<span className="truncate text-xs text-muted-foreground">
								{user.email}
							</span>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => router.push("/dashboard")}>
						<LayoutDashboardIcon />
						Dashboard
					</DropdownMenuItem>
					<DropdownMenuItem>
						<CircleUserRoundIcon />
						Account
					</DropdownMenuItem>
					<DropdownMenuItem>
						<BellIcon />
						Notifications
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleLogout}>
					<LogOutIcon />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function Header({ user }: { user?: AuthUser | null }) {
	const scrolled = useScroll(10);
	const pathname = usePathname();
	const solidNav = scrolled || pathname !== "/";

	return (
		<header className="sticky top-0 z-50 w-full">
			<nav
				className={cn(
					"mx-auto flex h-14 w-full items-center justify-between md:rounded-md md:border",
					solidNav
						? "max-w-3xl border-border bg-background/95 px-2 shadow backdrop-blur-sm supports-backdrop-filter:bg-background/50"
						: "max-w-4xl border-transparent px-4"
				)}
				style={{
					transition: "max-width 300ms ease-out, padding 300ms ease-out, background-color 200ms ease-out, box-shadow 200ms ease-out, border-color 200ms ease-out",
				}}
			>
				<Link
					className={cn(
						"flex items-center gap-2 rounded-md p-2 transition-colors",
						solidNav ? "hover:bg-muted dark:hover:bg-muted/50" : "hover:bg-white/10"
					)}
					href="/"
				>
					<LogoIcon className="h-8 w-auto" />
					<span className="text-lg font-semibold tracking-tight">
						<span className="text-[#2A7D4F]">Route</span>
						<span className={solidNav ? "text-foreground" : "text-white"}>
							Guard
						</span>
					</span>
				</Link>
				<div className="hidden items-center gap-2 md:flex">
					<div>
						{navLinks.map((link) => (
							<Button
								asChild
								key={link.label}
								size="sm"
								variant="ghost"
								className={
									solidNav ? "" : "text-white/80 hover:bg-white/10 hover:text-white"
								}
							>
								<Link href={link.href}>{link.label}</Link>
							</Button>
						))}
					</div>
					{user ? (
						<HeaderUserMenu user={user} scrolled={solidNav} />
					) : solidNav ? (
						<Button asChild size="sm">
							<Link href="/login">Login</Link>
						</Button>
					) : (
						<Button
							asChild
							size="sm"
							className="text-[#1B3A5C] hover:opacity-90"
							style={{ backgroundColor: "var(--color-brand-amber)" }}
						>
							<Link href="/login">Login</Link>
						</Button>
					)}
				</div>
				<MobileNav scrolled={solidNav} user={user} />
			</nav>
		</header>
	);
}
