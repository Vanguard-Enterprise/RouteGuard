"use client";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "@/components/desktop-nav";
import { MobileNav } from "@/components/mobile-nav";
import Link from "next/link";

export function Header() {
	const scrolled = useScroll(10);

	return (
		<header
			className={cn("sticky top-0 z-50 w-full border-transparent border-b", {
				"border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50":
					scrolled,
			})}
		>
			<nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
				<div className="flex items-center gap-5">
					<Link
						className="rounded-lg px-3 py-2.5 hover:bg-muted dark:hover:bg-muted/50"
						href="/"
					>
						<Logo className="h-6" />
					</Link>
					<DesktopNav />
				</div>
				<div className="hidden items-center gap-2 md:flex">
					<Button asChild variant="outline">
						<Link href="/staff/login">Staff Login</Link>
					</Button>
					<Button asChild>
						<Link href="/contact">Request a Demo</Link>
					</Button>
				</div>
				<MobileNav />
			</nav>
		</header>
	);
}
