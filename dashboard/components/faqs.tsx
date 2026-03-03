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
				<p className="text-muted-foreground">Common questions about RouteGuard.</p>
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
			"Most districts are fully operational within a single afternoon. You plug the RouteGuard device into your bus, it self-configures using a secure provisioning token from the admin console, and you assign routes from the dashboard. No complex IT setup required.",
	},
	{
		id: 2,
		category: "getting-started",
		title: "What hardware do we need?",
		content:
			"Each bus requires a RouteGuard Pi device (a pre-configured Raspberry Pi unit) and an RFID reader. Students receive RFID tags or cards. The admin dashboard runs in any modern web browser — no software installation needed.",
	},
	{
		id: 3,
		category: "getting-started",
		title: "Do drivers need to learn new software?",
		content:
			"No. Drivers interact only with the RFID reader on the bus. The student scanning is automatic — students tap their card, the device logs the event and triggers guardian notifications. Drivers don't need to touch any dashboard or app.",
	},
	{
		id: 4,
		category: "features",
		title: "How accurate is the GPS tracking?",
		content:
			"The RouteGuard device uses standard GPS with a typical accuracy of 3 to 5 meters. Position updates are sent to the live map every few seconds, giving dispatchers and administrators a near-real-time view of all vehicles.",
	},
	{
		id: 5,
		category: "features",
		title: "What information do parents receive in SMS alerts?",
		content:
			"When a student boards or exits the bus, their parent or guardian receives an automated SMS with the student's name, the event (boarding or exiting), the bus route, and the time. No app download is required on the parent's end.",
	},
	{
		id: 6,
		category: "features",
		title: "Can we manage multiple schools and routes from one account?",
		content:
			"Yes. The admin dashboard supports multiple organizations, schools, routes, and drivers under a single district account. Role-based permissions let you control who can see and edit which data.",
	},
	{
		id: 7,
		category: "pricing",
		title: "How is RouteGuard priced?",
		content:
			"Pricing is based on the number of buses in your district. Contact our team for a personalized quote — we work with districts of all sizes and can tailor a plan to your fleet and budget.",
	},
	{
		id: 8,
		category: "pricing",
		title: "Is there a trial or demo available?",
		content:
			"Yes. We offer a guided demo where we walk your transportation team through the full platform using your district's route data. Reach out via the contact page to schedule one.",
	},
	{
		id: 9,
		category: "support",
		title: "What support is included?",
		content:
			"All plans include email support with responses within one business day. Larger districts can request priority phone support and dedicated onboarding assistance to get every bus up and running smoothly.",
	},
	{
		id: 10,
		category: "support",
		title: "What happens if a device goes offline mid-route?",
		content:
			"The device stores scan events locally and syncs them to the server once connectivity is restored. GPS tracking resumes automatically when the device reconnects. Administrators receive an alert when a device loses connection.",
	},
];
