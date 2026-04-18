import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// filename -> asset-protocol URL (served directly by the webview, zero base64)
const urlCache = new Map<string, string>();
const pendingUrl = new Map<string, Promise<string>>();

// Static GIF frames remain as data URLs (generated from a canvas snapshot)
const staticFrameCache = new Map<string, string>();

export async function getImageUrl(projectId: string, filename: string): Promise<string> {
	const key = `${projectId}/${filename}`;
	const cached = urlCache.get(key);
	if (cached) return cached;
	const inflight = pendingUrl.get(key);
	if (inflight) return inflight;

	const promise = invoke<string>('get_image_path', { projectId, filename }).then((path) => {
		const src = convertFileSrc(path);
		urlCache.set(key, src);
		pendingUrl.delete(key);
		return src;
	});
	pendingUrl.set(key, promise);
	return promise;
}

export function getCachedStaticFrame(src: string): string | null {
	return staticFrameCache.get(src) ?? null;
}

export function cacheStaticFrame(src: string, staticSrc: string): void {
	staticFrameCache.set(src, staticSrc);
}

export function invalidateImage(projectId: string, filename: string): void {
	urlCache.delete(`${projectId}/${filename}`);
}
