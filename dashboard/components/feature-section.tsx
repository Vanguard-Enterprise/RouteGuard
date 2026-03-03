import { cn } from "@/lib/utils";
import type React from "react";
import { CobeGlobe } from "@/components/cobe-globe";
import { MapPinIcon, ScanLineIcon, GlobeIcon, SquareMousePointerIcon, MessageCircleIcon } from "lucide-react";

const features = [
	{
		id: "gps",
		children: <GpsTrackingVisual />,
		className: "md:col-span-2",
	},
	{
		id: "rfid",
		children: <RfidScanVisual />,
		className: "md:col-span-2",
	},
	{
		id: "sms",
		children: <SmsAlertsVisual />,
		className: "sm:col-span-2 md:col-span-2",
	},
	{
		id: "dashboard",
		children: <DashboardVisual />,
		className: "sm:col-span-2 md:col-span-3 p-0",
	},
	{
		id: "presence",
		children: <PresenceVisual />,
		className: "sm:col-span-2 md:col-span-3 p-0",
	},
];

export function FeatureSection() {
	return (
		<div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-6">
			{features.map((feature) => (
				<FeatureCard className={feature.className} key={feature.id}>
					{feature.children}
				</FeatureCard>
			))}
		</div>
	);
}

function FeatureCard({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-2xl border bg-background px-8 pt-8 pb-6",
				className
			)}
		>
			{children}
		</div>
	);
}

function FeatureTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return (
		<h3
			className={cn("font-medium text-foreground text-lg", className)}
			{...props}
		/>
	);
}

function FeatureDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)} {...props} />
	);
}

function GpsTrackingVisual() {
	return (
		<>
			<div className="relative mx-auto flex size-32 items-center justify-center rounded-full border-4 border-dashed bg-background shadow-xs outline outline-border outline-offset-4">
				<div className="absolute inset-0 z-10 scale-120 bg-radial from-foreground/20 via-foreground/5 to-transparent blur-xl" />
				<MapPinIcon className="size-14 text-primary/90" />
			</div>

			<div className="relative mt-8 space-y-1.5 text-center">
				<FeatureTitle>Live GPS Tracking</FeatureTitle>
				<FeatureDescription>
					Monitor every bus in real time on an interactive map. Know exactly where each vehicle is and whether routes are running on schedule.
				</FeatureDescription>
			</div>
		</>
	);
}

function RfidScanVisual() {
	return (
		<>
			<div className="relative mx-auto flex size-32 items-center justify-center rounded-full border bg-background shadow-xs outline outline-border outline-offset-4">
				<ScanLineIcon className="size-14 text-primary/80" />
				<div className="absolute inset-0 scale-120 bg-radial from-foreground/15 via-foreground/5 to-transparent blur-xl" />
			</div>

			<div className="relative mt-8 space-y-1.5 text-center">
				<FeatureTitle>RFID Student Scanning</FeatureTitle>
				<FeatureDescription>
					Students tap their RFID tag when boarding and exiting. Every scan is logged with timestamp, stop, and driver — a complete attendance record.
				</FeatureDescription>
			</div>
		</>
	);
}

function SmsAlertsVisual() {
	return (
		<>
			<div className="min-h-32">
				<div className="absolute top-8 left-8 flex items-center gap-2">
					<div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
						<MessageCircleIcon className="size-4" />
					</div>
					<div className="font-medium text-muted-foreground text-sm">Instant</div>
				</div>
				<SmsChartSvg className="translate-x-[5%] -rotate-2 scale-150" />
			</div>
			<div className="relative z-10 mt-8 space-y-1.5 text-center">
				<FeatureTitle>Guardian SMS Alerts</FeatureTitle>
				<FeatureDescription>
					Parents receive an automatic text the moment their child boards or exits the bus. No app required — just a phone number.
				</FeatureDescription>
			</div>
		</>
	);
}

function DashboardVisual() {
	return (
		<div className="grid h-full sm:grid-cols-2">
			<div className="relative z-10 space-y-6 py-8 ps-8 pe-2">
				<div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
					<SquareMousePointerIcon className="size-5 text-primary/80" />
				</div>
				<div className="space-y-2">
					<FeatureTitle className="text-base">
						Intuitive Admin Dashboard
					</FeatureTitle>
					<FeatureDescription>
						Manage routes, devices, students, and drivers from one clean interface. Built for transportation coordinators, not IT specialists.
					</FeatureDescription>
				</div>
			</div>
			{/* Dashboard mockup */}
			<div className="mask-b-from-90% mask-r-from-90% relative aspect-video sm:aspect-auto">
				<div className="absolute -right-1 -bottom-1 aspect-video max-h-50 rounded-tl-md border bg-card p-1 sm:max-h-42 md:aspect-square md:max-h-50 lg:aspect-16/12">
					<div className="aspect-video h-full overflow-hidden rounded-tl-sm border *:pointer-events-none *:size-full *:shrink-0 *:select-none bg-muted flex items-center justify-center">
						<MapPinIcon className="size-12 text-muted-foreground/30" />
					</div>
				</div>
			</div>
		</div>
	);
}

function PresenceVisual() {
	return (
		<div className="grid max-h-120 sm:grid-cols-2">
			<div className="space-y-6 pt-8 pb-4 pl-8 sm:pb-8">
				<div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
					<GlobeIcon className="size-5 text-primary/80" />
				</div>
				<div className="space-y-2">
					<FeatureTitle className="text-base">
						Monitor From Anywhere
					</FeatureTitle>
					<FeatureDescription>
						Access the live map and student records from any device. No software install — just log in from a browser.
					</FeatureDescription>
				</div>
			</div>
			<div className="relative">
				<CobeGlobe className="-top-[12%] right-0 sm:absolute" />
			</div>
		</div>
	);
}

function SmsChartSvg(props: React.ComponentProps<"svg">) {
	return (
		<svg
			fill="none"
			viewBox="0 0 300 128"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<path
				clipRule="evenodd"
				d="M3 123C3 123 14.3298 94.153 35.1282 88.0957C55.9266 82.0384 65.9333 80.5508 65.9333 80.5508C65.9333 80.5508 80.699 80.5508 92.1777 80.5508C103.656 80.5508 100.887 63.5348 109.06 63.5348C117.233 63.5348 117.217 91.9728 124.78 91.9728C132.343 91.9728 142.264 78.03 153.831 80.5508C165.398 83.0716 186.825 91.9728 193.761 91.9728C200.697 91.9728 206.296 63.5348 214.07 63.5348C221.844 63.5348 238.653 93.7771 244.234 91.9728C249.814 90.1684 258.8 60 266.19 60C272.075 60 284.1 88.057 286.678 88.0957C294.762 88.2171 300.192 72.9284 305.423 72.9284C312.323 72.9284 323.377 65.2437 335.553 63.5348C347.729 61.8259 348.218 82.07 363.639 80.5508C367.875 80.1335 372.949 82.2017 376.437 87.1008C379.446 91.3274 381.054 97.4325 382.521 104.647C383.479 109.364 382.521 123 382.521 123"
				fill="url(#paint0_linear_rg)"
				fillRule="evenodd"
			/>
			<path
				className="text-primary"
				d="M3 121.077C3 121.077 15.3041 93.6691 36.0195 87.756C56.7349 81.8429 66.6632 80.9723 66.6632 80.9723C66.6632 80.9723 80.0327 80.9723 91.4656 80.9723C102.898 80.9723 100.415 64.2824 108.556 64.2824C116.696 64.2824 117.693 92.1332 125.226 92.1332C132.759 92.1332 142.07 78.5115 153.591 80.9723C165.113 83.433 186.092 92.1332 193 92.1332C199.908 92.1332 205.274 64.2824 213.017 64.2824C220.76 64.2824 237.832 93.8946 243.39 92.1332C248.948 90.3718 257.923 60.5 265.284 60.5C271.145 60.5 283.204 87.7182 285.772 87.756C293.823 87.8746 299.2 73.0802 304.411 73.0802C311.283 73.0802 321.425 65.9506 333.552 64.2824C345.68 62.6141 346.91 82.4553 362.27 80.9723C377.629 79.4892 383 106.605 383 106.605"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<defs>
				<linearGradient
					gradientUnits="userSpaceOnUse"
					id="paint0_linear_rg"
					x1="3"
					x2="3"
					y1="60"
					y2="123"
				>
					<stop className="text-primary/20" stopColor="currentColor" />
					<stop
						className="text-background"
						offset="1"
						stopColor="currentColor"
						stopOpacity="0.103775"
					/>
				</linearGradient>
			</defs>
		</svg>
	);
}
