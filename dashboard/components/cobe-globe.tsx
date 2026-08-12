"use client";
import { useEffect, useRef } from "react";

export function CobeGlobe({ className }: { className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		let phi = 0;
		let disposed = false;
		let isVisible = false;
		let globe: import("phenomenon").default | undefined;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

		const syncRendering = () => {
			globe?.toggle(isVisible && !document.hidden && !reducedMotion.matches);
		};

		const start = async () => {
			if (globe || disposed) return;
			const { default: createGlobe } = await import("cobe");
			if (disposed) return;

			const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
			globe = createGlobe(canvas, {
			devicePixelRatio,
			width: 600 * devicePixelRatio,
			height: 600 * devicePixelRatio,
			phi: 0,
			theta: 0,
			dark: 1,
			diffuse: 1.2,
			mapSamples: 8_000,
			mapBrightness: 6,
			baseColor: [0.3, 0.3, 0.3],
			markerColor: [0.1, 0.8, 1],
			glowColor: [1, 1, 1],
			markers: [
				// longitude latitude
				{ location: [37.7595, -122.4367], size: 0.03 },
				{ location: [40.7128, -74.006], size: 0.1 },
			],
			onRender: (state) => {
				state.phi = phi;
				if (!reducedMotion.matches) phi += 0.003;
			},
			});
			syncRendering();
		};

		const observer = new IntersectionObserver(
			([entry]) => {
				isVisible = entry.isIntersecting;
				if (isVisible) void start();
				syncRendering();
			},
			{ rootMargin: "200px" }
		);
		observer.observe(canvas);
		document.addEventListener("visibilitychange", syncRendering);
		reducedMotion.addEventListener("change", syncRendering);

		return () => {
			disposed = true;
			observer.disconnect();
			document.removeEventListener("visibilitychange", syncRendering);
			reducedMotion.removeEventListener("change", syncRendering);
			globe?.destroy();
		};
	}, []);

	return (
		<canvas
			className={className}
			ref={canvasRef}
			style={{ width: 600, height: 600, maxWidth: "100%", aspectRatio: 1 }}
		/>
	);
}
