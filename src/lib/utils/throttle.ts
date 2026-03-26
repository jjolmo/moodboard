export function throttle<T extends (...args: any[]) => any>(fn: T, ms: number): T {
	let last = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastArgs: any[] | null = null;

	return ((...args: any[]) => {
		const now = Date.now();
		lastArgs = args;
		if (now - last >= ms) {
			last = now;
			fn(...args);
		} else if (!timer) {
			timer = setTimeout(() => {
				last = Date.now();
				timer = null;
				if (lastArgs) fn(...lastArgs);
			}, ms - (now - last));
		}
	}) as unknown as T;
}
