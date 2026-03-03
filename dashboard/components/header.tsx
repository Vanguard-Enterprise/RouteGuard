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
				"sticky top-0 z-50 w-full border-b transition-all ease-out",
				scrolled
					? "border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
					: "border-transparent bg-[#1B3A5C]"
			)}
		>
			<nav
				className={cn(
					"mx-auto flex w-full max-w-4xl items-center justify-between px-4 md:transition-all md:ease-out",
					scrolled ? "h-12 md:max-w-3xl md:px-2" : "h-14"
				)}
			>
				<Link
					className={cn(
						"flex items-center gap-2 rounded-md p-2 transition-colors",
						scrolled ? "hover:bg-muted dark:hover:bg-muted/50" : "hover:bg-white/10"
					)}
					href="/"
				>
					<LogoIcon className="h-8 w-auto" />
					<span className="font-semibold tracking-tight">
						<span className="text-[#2A7D4F]">Route</span>
						<span className={scrolled ? "text-[#1B3A5C] dark:text-foreground" : "text-white"}>
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
									scrolled ? "" : "text-white/80 hover:bg-white/10 hover:text-white"
								}
							>
								<Link href={link.href}>{link.label}</Link>
							</Button>
						))}
					</div>
					{scrolled ? (
						<Button asChild size="sm">
							<Link href="/contact">Request a Demo</Link>
						</Button>
					) : (
						<Button
							asChild
							size="sm"
							className="text-[#1B3A5C] hover:opacity-90"
							style={{ backgroundColor: "var(--color-brand-amber)" }}
						>
							<Link href="/contact">Request a Demo</Link>
						</Button>
					)}
				</div>
				<MobileNav scrolled={scrolled} />
			</nav>
		</header>
	);
}
