import { cn } from "@/lib/utils";

type LogoType = {
	src: string;
	alt: string;
	isInvertable?: boolean;
};

type TileData = {
	row: number;
	col: number;
	logo?: LogoType;
};

export function Integrations() {
	return (
		<div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 p-4 md:grid-cols-2 md:items-center">
			{/* Left Content */}
			<div className="max-w-xl space-y-5">
				<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl md:text-5xl">
					District-Compatible By Design
				</h2>
				<p className="text-lg text-muted-foreground leading-8">
					RouteGuard syncs with common SIS and identity tools so rosters and
					attendance stay aligned. The platform is built around minimal,
					non-identifiable student data handling with FERPA-focused workflows.
				</p>
			</div>

			{/* Right Content - Visual */}
			<div className="place-items-end">
				<div className="mask-[radial-gradient(ellipse_at_center,black,black,transparent)] relative size-90">
					{tiles.map((tile) => (
						<IntegrationCard key={`${tile.row}_${tile.col}`} {...tile} />
					))}
				</div>
			</div>
		</div>
	);
}

function IntegrationCard({ row, col, logo }: TileData) {
	return (
		<div
			className={cn(
				"absolute flex size-18 items-center justify-center rounded-md border",
				logo
					? "bg-card shadow-xs dark:bg-card/60"
					: "bg-secondary/30 dark:bg-background"
			)}
			style={{
				left: col * 72,
				top: row * 72,
			}}
		>
			{logo && (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					alt={logo.alt}
					className={cn(
						"pointer-events-none size-11 select-none object-contain",
						logo.isInvertable && "dark:invert"
					)}
					height={44}
					src={logo.src}
					width={44}
				/>
			)}
		</div>
	);
}

const tiles: TileData[] = [
	// Row 0
	{ row: 0, col: 1 },
	{
		row: 0,
		col: 3,
		logo: {
			src: "/logos/powerschool.svg",
			alt: "PowerSchool",
		},
	},

	// Row 1
	{ row: 1, col: 0 },
	{
		row: 1,
		col: 2,
		logo: {
			src: "/logos/infinitecampus.svg",
			alt: "Infinite Campus",
		},
	},
	{
		row: 1,
		col: 4,
		logo: {
			src: "/logos/synergy.svg",
			alt: "Synergy",
		},
	},

	// Row 2
	{
		row: 2,
		col: 1,
		logo: {
			src: "/logos/skyward.png",
			alt: "Skyward",
		},
	},
	{
		row: 2,
		col: 3,
		logo: {
			src: "/logos/clever.png",
			alt: "Clever",
		},
	},

	// Row 3
	{ row: 3, col: 0 },
	{
		row: 3,
		col: 2,
		logo: {
			src: "/logos/google.svg",
			alt: "Google Workspace",
		},
	},
	{
		row: 3,
		col: 4,
		logo: {
			src: "/logos/microsoft.svg",
			alt: "Microsoft",
		},
	},
];
