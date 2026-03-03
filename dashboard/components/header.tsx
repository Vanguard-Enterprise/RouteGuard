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
		<header className="sticky top-0 z-50 w-full">
			<nav
				className={cn(
					"mx-auto flex h-14 w-full items-center justify-between md:rounded-md md:border",
					scrolled
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
						scrolled ? "hover:bg-muted dark:hover:bg-muted/50" : "hover:bg-white/10"
					)}
					href="/"
				>
					<LogoIcon className="h-8 w-auto" />
					<span className="text-lg font-semibold tracking-tight">
						<span className="text-[#2A7D4F]">Route</span>
						<span className={scrolled ? "text-foreground" : "text-white"}>
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
