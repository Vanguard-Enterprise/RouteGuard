const stack = [
	{ name: "Go", description: "Backend API" },
	{ name: "PostgreSQL", description: "Database" },
	{ name: "Redis", description: "Sessions & cache" },
	{ name: "Next.js", description: "Dashboard" },
	{ name: "Mapbox", description: "Mapping engine" },
	{ name: "Twilio", description: "SMS alerts" },
	{ name: "Docker", description: "Containers" },
	{ name: "Traefik", description: "Load balancer" },
];

export function LogoCloud() {
	return (
		<div className="flex flex-wrap items-center justify-center gap-3 py-4">
			{stack.map((item) => (
				<div
					key={item.name}
					className="flex flex-col items-center rounded-lg border bg-card px-4 py-3 shadow-xs"
				>
					<span className="text-sm font-semibold text-foreground">
						{item.name}
					</span>
					<span className="text-xs text-muted-foreground">{item.description}</span>
				</div>
			))}
		</div>
	);
}
