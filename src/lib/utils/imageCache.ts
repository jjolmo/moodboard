import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// Three LOD buckets: 256 (tiny thumbs), 1024 (medium), 0 (full original)
export type LodBucket = 0 | 256 | 1024;

// key: `${projectId}/${filename}@${bucket}` -> asset URL
const urlCache = new Map<string, string>();
const pendingUrl = new Map<string, Promise<string>>();
const staticFrameCache = new Map<string, string>();

function key(projectId: string, filename: string, bucket: LodBucket) {
	return `${projectId}/${filename}@${bucket}`;
}

export async function getImageUrl(
	projectId: string,
	filename: string,
	bucket: LodBucket = 0
): Promise<string> {
	const k = key(projectId, filename, bucket);
	const cached = urlCache.get(k);
	if (cached) return cached;
	const inflight = pendingUrl.get(k);
	if (inflight) return inflight;

	const promise = (async () => {
		let path: string;
		if (bucket === 0) {
			path = await invoke<string>('get_image_path', { projectId, filename });
		} else {
			path = await invoke<string>('get_image_thumbnail_path', {
				projectId,
				filename,
				bucket
			});
		}
		const src = convertFileSrc(path);
		urlCache.set(k, src);
		pendingUrl.delete(k);
		return src;
	})();
	pendingUrl.set(k, promise);
	return promise;
}

export function getCachedStaticFrame(src: string): string | null {
	return staticFrameCache.get(src) ?? null;
}

export function cacheStaticFrame(src: string, staticSrc: string): void {
	staticFrameCache.set(src, staticSrc);
}

export function invalidateImage(projectId: string, filename: string): void {
	for (const b of [0, 256, 1024] as LodBucket[]) {
		urlCache.delete(key(projectId, filename, b));
	}
}

/**
 * Pick a LOD bucket given the on-screen displayed size in CSS pixels
 * (already multiplied by zoom + devicePixelRatio).
 *
 * Hysteresis: the caller should pass `previous` to avoid thrashing near
 * thresholds. We only move DOWN in quality if displayPx is well below the
 * upper bound, and UP only when we clearly need more pixels.
 */
export function pickBucket(displayPx: number, previous: LodBucket | null): LodBucket {
	// Thresholds (px on the longest visible side)
	//   <= 180   -> 256
	//   <= 800   -> 1024
	//   else     -> 0 (original)
	// Hysteresis: only escalate if we exceed threshold by 20%, only downgrade if below by 20%
	const HYST = 0.2;
	if (previous === null) {
		if (displayPx <= 180) return 256;
		if (displayPx <= 800) return 1024;
		return 0;
	}
	if (previous === 256) {
		if (displayPx > 180 * (1 + HYST)) {
			if (displayPx <= 800) return 1024;
			return 0;
		}
		return 256;
	}
	if (previous === 1024) {
		if (displayPx < 180 * (1 - HYST)) return 256;
		if (displayPx > 800 * (1 + HYST)) return 0;
		return 1024;
	}
	// previous === 0
	if (displayPx < 800 * (1 - HYST)) {
		if (displayPx <= 180) return 256;
		return 1024;
	}
	return 0;
}
