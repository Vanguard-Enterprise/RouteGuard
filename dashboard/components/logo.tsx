import type React from "react";

export const LogoIcon = ({ className, ...props }: React.ComponentProps<"img">) => (
	<img
		src="/logo.png"
		alt="RouteGuard"
		className={className}
		{...props}
	/>
);

export const Logo = ({ className, ...props }: React.ComponentProps<"img">) => (
	<img
		src="/text-logo.png"
		alt="RouteGuard"
		className={className}
		{...props}
	/>
);
