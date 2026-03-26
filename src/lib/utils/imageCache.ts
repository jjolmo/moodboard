import { invoke } from '@tauri-apps/api/core';

const cache = new Map<string, string>();
const staticFrameCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export async function getCachedImage(projectId: string, filename: string): Promise<string> {
	const key = `${projectId}/${filename}`;
	if (cache.has(key)) return cache.get(key)!;
	if (pending.has(key)) return pending.get(key)!;

	const promise = invoke<string>('get_image_base64', { projectId, filename }).then((src) => {
		cache.set(key, src);
		pending.delete(key);
		return src;
	});
	pending.set(key, promise);
	return promise;
}

export function getCachedStaticFrame(src: string): string | null {
	return staticFrameCache.get(src) ?? null;
}

export function cacheStaticFrame(src: string, staticSrc: string): void {
	staticFrameCache.set(src, staticSrc);
}

export function invalidateImage(projectId: string, filename: string): void {
	cache.delete(`${projectId}/${filename}`);
}
