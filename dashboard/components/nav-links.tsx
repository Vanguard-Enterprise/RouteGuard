import type { LinkItemType } from "@/components/sheard";
import { MapPinIcon, ScanLineIcon, MessageCircleIcon, LayoutDashboardIcon, CreditCardIcon, HelpCircleIcon, MailIcon, ShieldIcon, FileTextIcon } from "lucide-react";

export const productLinks: LinkItemType[] = [
	{
		label: "Live GPS Tracking",
		href: "/#features",
		description: "Real-time bus location on an interactive map",
		icon: <MapPinIcon />,
	},
	{
		label: "RFID Scanning",
		href: "/#features",
		description: "Automatic student boarding and exit logs",
		icon: <ScanLineIcon />,
	},
	{
		label: "Guardian Alerts",
		href: "/#features",
		description: "Instant SMS notifications for parents",
		icon: <MessageCircleIcon />,
	},
	{
		label: "Admin Dashboard",
		href: "/#features",
		description: "Manage routes, drivers, and students in one place",
		icon: <LayoutDashboardIcon />,
	},
];

export const companyLinks: LinkItemType[] = [
	{
		label: "Pricing",
		href: "/pricing",
		description: "Plans for districts of any size",
		icon: <CreditCardIcon />,
	},
	{
		label: "FAQs",
		href: "/#faqs",
		description: "Common questions answered",
		icon: <HelpCircleIcon />,
	},
	{
		label: "Contact",
		href: "/contact",
		description: "Get in touch with our team",
		icon: <MailIcon />,
	},
];

export const companyLinks2: LinkItemType[] = [
	{
		label: "Privacy Policy",
		href: "/privacy",
		icon: <ShieldIcon />,
	},
	{
		label: "Terms of Service",
		href: "/terms",
		icon: <FileTextIcon />,
	},
];
