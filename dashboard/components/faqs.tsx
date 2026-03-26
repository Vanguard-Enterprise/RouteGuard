"use client";
import { cn } from "@/lib/utils";
import React from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { LayoutGridIcon, PowerIcon, ScanLineIcon, CreditCardIcon, LifeBuoyIcon } from "lucide-react";

const categories = [
	{
		icon: <LayoutGridIcon className="size-4" />,
		id: "all",
		label: "All Topics",
	},
	{
		icon: <PowerIcon className="size-4" />,
		id: "getting-started",
		label: "Getting Started",
	},
	{
		icon: <ScanLineIcon className="size-4" />,
		id: "features",
		label: "Features",
	},
	{
		icon: <CreditCardIcon className="size-4" />,
		id: "pricing",
		label: "Pricing",
	},
	{
		icon: <LifeBuoyIcon className="size-4" />,
		id: "support",
		label: "Support",
	},
];

export function FaqsSection() {
	const [activeCategory, setActiveCategory] = React.useState("all");

	const filtered = faqs.filter((faq) => {
		const matchesCategory =
			activeCategory === "all" || faq.category === activeCategory;
		return matchesCategory;
	});

	const currentCategory = categories.find((cat) => cat.id === activeCategory);

	return (
		<section className="mx-auto min-h-screen w-full max-w-5xl">
			<div className="flex flex-col items-center justify-center gap-4 px-4 py-16">
				<h2 className="text-balance font-black font-mono text-4xl md:text-5xl lg:font-black">
					FAQs
				</h2>
				<p className="text-muted-foreground">Common questions from district transportation teams and families.</p>
			</div>
			<div className="relative grid min-h-full grid-cols-1 py-12 md:grid-cols-3">
				<div className="flex h-full items-start justify-center border-b pb-2 md:border-b-0">
					<div className="flex w-max flex-wrap items-start justify-start gap-2 md:flex-col md:justify-center">
						{categories.map((cat) => (
							<Button
								className={cn(
									"border border-transparent",
									activeCategory === cat.id && "border-border"
								)}
								key={cat.id}
								onClick={() => setActiveCategory(cat.id)}
								variant={activeCategory === cat.id ? "outline" : "ghost"}
							>
								{cat.icon}
								{cat.label}
							</Button>
						))}
					</div>
				</div>
				<div className="col-span-2 space-y-5 px-4 py-5">
					{currentCategory && (
						<div className="flex items-center gap-2">
							{currentCategory.icon}
							<span className="font-medium">{currentCategory.label}</span>
						</div>
					)}
					<Accordion
						className="space-y-2"
						collapsible
						defaultValue="1"
						type="single"
					>
						{filtered.map((item) => (
							<AccordionItem
								className="border-b-0"
								key={item.id}
								value={item.id.toString()}
							>
								<AccordionTrigger className="border bg-card px-4 shadow hover:no-underline">
									{item.title}
								</AccordionTrigger>

								<AccordionContent className="px-4 py-4">
									{item.content}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}

const faqs = [
	{
		id: 1,
		category: "getting-started",
		title: "How quickly can we get RouteGuard up and running?",
		content:
			"Initial deployments run as guided pilots. Our current model starts with select buses per school so teams can validate safety, accountability, and operations before broader rollout.",
	},
	{
		id: 2,
		category: "getting-started",
		title: "What hardware do we need?",
		content:
			"Each bus uses RouteGuard bus hardware, an RFID scanner, and student RFID bands/tags. The district team manages operations through a web-based admin dashboard.",
	},
	{
		id: 3,
		category: "getting-started",
		title: "Do drivers need to learn new software?",
		content:
			"No. Drivers focus on transportation and use simple on-bus controls, including a tiered panic button for emergency severity reporting. Student verification and guardian notifications run automatically.",
	},
	{
		id: 4,
		category: "features",
		title: "How accurate is the GPS tracking?",
		content:
			"RouteGuard provides live route visibility for district teams and families, with continuous status updates that support both daily operations and rapid incident response.",
	},
	{
		id: 5,
		category: "features",
		title: "What information do parents receive in SMS alerts?",
		content:
			"Parents and guardians receive real-time notifications tied to student boarding and exit activity, helping close visibility gaps beyond location-only tracking.",
	},
	{
		id: 6,
		category: "features",
		title: "Can we manage multiple schools and routes from one account?",
		content:
			"Yes. RouteGuard is designed for district operations across multiple schools, routes, and drivers with centralized visibility and operational control.",
	},
	{
		id: 7,
		category: "pricing",
		title: "How is RouteGuard priced?",
		content:
			"Our current business plan models pricing in fleet packages. For example, the per-20-bus package is listed at $142,750 and includes bus hardware, RFID bands, admin dashboard access, sensors, and cellular/offline support.",
	},
	{
		id: 8,
		category: "pricing",
		title: "Is there a pilot or demo available?",
		content:
			"Yes. RouteGuard supports pilot-first deployments and guided demos. Pilot outcomes are used to refine configuration before district-wide adoption.",
	},
	{
		id: 9,
		category: "support",
		title: "What support is included?",
		content:
			"Districts receive onboarding guidance, rollout support, and direct issue resolution pathways so implementation remains smooth as adoption expands.",
	},
	{
		id: 10,
		category: "support",
		title: "What happens if a device goes offline mid-route?",
		content:
			"RouteGuard includes an offline safety layer that keeps critical scan and safety functions active when connectivity drops, then syncs records when service returns.",
	},
];
