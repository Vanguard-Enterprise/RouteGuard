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
					Built on Trusted Technology
				</h2>
				<p className="text-lg text-muted-foreground leading-8">
					RouteGuard uses proven infrastructure for GPS mapping, SMS delivery, cloud hosting, and device provisioning — so your district gets reliability at scale.
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
				<img
					alt={logo.alt}
					className={cn(
						"pointer-events-none size-8 select-none object-contain p-1",
						logo.isInvertable && "dark:invert"
					)}
					height={40}
					src={logo.src}
					width={40}
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
			src: "https://storage.efferd.com/logo/vercel.svg",
			alt: "Vercel",
			isInvertable: true,
		},
	},

	// Row 1
	{ row: 1, col: 0 },
	{
		row: 1,
		col: 2,
		logo: {
			src: "https://storage.efferd.com/logo/supabase.svg",
			alt: "Supabase",
		},
	},
	{
		row: 1,
		col: 4,
		logo: {
			src: "https://storage.efferd.com/logo/notion.svg",
			alt: "Notion",
		},
	},

	// Row 2
	{
		row: 2,
		col: 1,
		logo: {
			src: "https://storage.efferd.com/logo/gmail.svg",
			alt: "Gmail",
		},
	},
	{
		row: 2,
		col: 3,
		logo: {
			src: "https://storage.efferd.com/logo/cursor.svg",
			alt: "Cursor",
			isInvertable: true,
		},
	},

	// Row 3
	{ row: 3, col: 0 },
	{
		row: 3,
		col: 2,
		logo: {
			src: "https://storage.efferd.com/logo/canva.svg",
			alt: "Canva",
		},
	},
	{
		row: 3,
		col: 4,
		logo: {
			src: "https://storage.efferd.com/logo/adobe.svg",
			alt: "Adobe",
		},
	},

	// Row 4
	{
		row: 4,
		col: 1,
		logo: {
			src: "https://storage.efferd.com/logo/polar.svg",
			alt: "Polar",
		},
	},
	{
		row: 4,
		col: 3,
		logo: {
			src: "https://storage.efferd.com/logo/planetscale.svg",
			alt: "Planetscale",
			isInvertable: true,
		},
	},
];
