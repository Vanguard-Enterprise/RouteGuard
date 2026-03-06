"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import Link from "next/link";

type FooterLink = {
	title: string;
	href: string;
};

type FooterSection = {
	label: string;
	links: FooterLink[];
};

const footerLinks: FooterSection[] = [
	{
		label: "Product",
		links: [
			{ title: "Features", href: "/#features" },
			{ title: "Pricing", href: "/pricing" },
			{ title: "Contact", href: "/contact" },
		],
	},
	{
		label: "Company",
		links: [
			{ title: "FAQs", href: "/faqs" },
			{ title: "Privacy Policy", href: "/privacy" },
			{ title: "Terms of Service", href: "/terms" },
		],
	},
	{
		label: "Portal",
		links: [
			{ title: "Staff Login", href: "/staff/login" },
			{ title: "Request a Demo", href: "/contact" },
		],
	},
];

export function Footer() {
	return (
		<footer
			className="w-full border-t"
			style={{ backgroundColor: "var(--color-brand-slate)" }}
		>
			<div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 md:px-8">
				<div className="grid w-full gap-8 py-6 md:py-8 lg:grid-cols-3 lg:gap-8">
					<AnimatedContainer className="space-y-4">
						<Logo className="h-7" />
						<p className="mt-8 text-muted-foreground text-sm md:mt-0">
							School bus tracking and student safety platform for modern transportation departments.
						</p>
					</AnimatedContainer>

					<div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-3 lg:col-span-2 lg:mt-0">
						{footerLinks.map((section, index) => (
							<AnimatedContainer delay={0.1 + index * 0.1} key={section.label}>
								<div className="mb-10 md:mb-0">
									<h3 className="text-xs text-muted-foreground uppercase tracking-wider">{section.label}</h3>
									<ul className="mt-4 space-y-2 text-muted-foreground text-sm">
										{section.links.map((link) => (
											<li key={link.title}>
												<Link
													className="inline-flex items-center duration-250 hover:text-foreground"
													href={link.href}
												>
													{link.title}
												</Link>
											</li>
										))}
									</ul>
								</div>
							</AnimatedContainer>
						))}
					</div>
				</div>
				<div className="h-px w-full bg-linear-to-r via-border" />
				<div className="flex w-full items-center justify-center py-4">
					<p className="text-muted-foreground text-sm">
						&copy; {new Date().getFullYear()} RouteGuard. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}

function AnimatedContainer({
	className,
	delay = 0.1,
	children,
}: {
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const shouldReduceMotion = useReducedMotion();

	if (shouldReduceMotion) {
		return children;
	}

	return (
		<motion.div
			className={className}
			initial={{ filter: "blur(4px)", translateY: -8, opacity: 0 }}
			transition={{ delay, duration: 0.8 }}
			viewport={{ once: true }}
			whileInView={{ filter: "blur(0px)", translateY: 0, opacity: 1 }}
		>
			{children}
		</motion.div>
	);
}
