"use client";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/logo";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";
import Link from "next/link";

export const navLinks = [
	{ label: "Features", href: "/#features" },
	{ label: "Pricing", href: "/pricing" },
	{ label: "Contact", href: "/contact" },
];

export function Header() {
	const scrolled = useScroll(10);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 mx-auto w-full max-w-4xl border-transparent border-b md:rounded-md md:border md:transition-all md:ease-out",
				{
					"border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50 md:top-2 md:max-w-3xl md:shadow":
						scrolled,
				}
			)}
		>
			<nav
				className={cn(
					"flex h-14 w-full items-center justify-between px-4 md:h-12 md:transition-all md:ease-out",
					{ "md:px-2": scrolled }
				)}
			>
				<Link
					className="flex items-center gap-2 rounded-md p-2 hover:bg-muted dark:hover:bg-muted/50"
					href="/"
				>
					<LogoIcon className="h-8 w-auto" />
					<span className="font-semibold tracking-tight text-[#1B3A5C] dark:text-foreground">
						RouteGuard
					</span>
				</Link>
				<div className="hidden items-center gap-2 md:flex">
					<div>
						{navLinks.map((link) => (
							<Button asChild key={link.label} size="sm" variant="ghost">
								<Link href={link.href}>{link.label}</Link>
							</Button>
						))}
					</div>
					<Button asChild size="sm">
						<Link href="/contact">Request a Demo</Link>
					</Button>
				</div>
				<MobileNav />
			</nav>
		</header>
	);
}
