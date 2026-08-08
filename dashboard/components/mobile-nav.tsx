"use client";
import { cn } from "@/lib/utils";
import React from "react";
import { Portal, PortalBackdrop } from "@/components/ui/portal";
import { Button } from "@/components/ui/button";
import { navLinks } from "@/components/header";
import { XIcon, MenuIcon, LayoutDashboardIcon, CircleUserRoundIcon, BellIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/api";
import { clearDemoSession } from "@/lib/demo-session-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function getInitials(name: string) {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function MobileNav({ scrolled, user }: { scrolled?: boolean; user?: AuthUser | null }) {
	const [open, setOpen] = React.useState(false);
	const router = useRouter();

	async function handleLogout() {
		clearDemoSession();
		setOpen(false);
		router.push("/");
	}

	return (
		<div className="md:hidden">
			<Button
				aria-controls="mobile-menu"
				aria-expanded={open}
				aria-label="Toggle menu"
				className={cn(
					"md:hidden",
					!scrolled && "border-white/30 text-white hover:bg-white/10 hover:text-white"
				)}
				onClick={() => setOpen(!open)}
				size="icon"
				variant="outline"
			>
				{open ? <XIcon /> : <MenuIcon />}
			</Button>
			{open && (
				<Portal className="top-14" id="mobile-menu">
					<PortalBackdrop />
					<div
						className={cn(
							"data-[slot=open]:zoom-in-97 ease-out data-[slot=open]:animate-in",
							"size-full p-4"
						)}
						data-slot={open ? "open" : "closed"}
					>
						<div className="grid gap-y-2">
							{navLinks.map((link) => (
								<Button
									asChild
									className="justify-start"
									key={link.label}
									onClick={() => setOpen(false)}
									variant="ghost"
								>
									<Link href={link.href}>{link.label}</Link>
								</Button>
							))}
						</div>
						<div className="mt-12 flex flex-col gap-2">
							{user ? (
								<>
									<div className="flex items-center gap-2 px-3 py-2">
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
									<Button asChild variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
										<Link href="/dashboard">
											<LayoutDashboardIcon className="mr-2 size-4" />
											Dashboard
										</Link>
									</Button>
									<Button variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
										<CircleUserRoundIcon className="mr-2 size-4" />
										Account
									</Button>
									<Button variant="ghost" className="justify-start" onClick={() => setOpen(false)}>
										<BellIcon className="mr-2 size-4" />
										Notifications
									</Button>
									<Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={handleLogout}>
										<LogOutIcon className="mr-2 size-4" />
										Sign out
									</Button>
								</>
							) : (
								<Button asChild className="w-full">
									<Link href="/login" onClick={() => setOpen(false)}>
										Login
									</Link>
								</Button>
							)}
						</div>
					</div>
				</Portal>
			)}
		</div>
	);
}
