import Image, { type ImageProps } from "next/image";
import logoIcon from "@/public/logo.png";
import textLogo from "@/public/text-logo.png";

type LogoProps = Omit<ImageProps, "alt" | "src">;

export const LogoIcon = ({ className, sizes = "32px", ...props }: LogoProps) => (
	<Image
		src={logoIcon}
		alt="RouteGuard"
		className={className}
		sizes={sizes}
		{...props}
	/>
);

export const Logo = ({ className, sizes = "128px", ...props }: LogoProps) => (
	<Image
		src={textLogo}
		alt="RouteGuard"
		className={className}
		sizes={sizes}
		{...props}
	/>
);
