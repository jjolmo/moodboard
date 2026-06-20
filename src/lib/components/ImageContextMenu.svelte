<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { MoodImageData } from '$lib/types';

	const menu = $derived(appStore.imageContextMenu);
	const element = $derived(menu ? appStore.elements.find(e => e.id === menu.elementId) ?? null : null);
</script>

<svelte:window onclick={() => appStore.closeImageContextMenu()} />

{#if menu && element}
	<div class="ctx-overlay" style="left:{menu.x}px;top:{menu.y}px;">
		<button class="ctx-btn" style="color:{element.alwaysOnTop ? 'var(--ui-accent)' : 'var(--text-primary)'}"
			onclick={() => { appStore.toggleAlwaysOnTop(menu.elementId); appStore.closeImageContextMenu(); }}>
			<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
			</svg>
			<span class="ctx-label">Always on top</span>
			{#if element.alwaysOnTop}<span class="ctx-check">&#10003;</span>{/if}
		</button>
		{#if element.type === 'image'}
			<button class="ctx-btn"
				onclick={() => {
					appStore.selectElement(menu.elementId);
					appStore.copyAsReference();
					appStore.closeImageContextMenu();
				}}>
				<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				</svg>
				<span class="ctx-label">Copy as reference</span>
			</button>
			<button class="ctx-btn"
				onclick={() => {
					appStore.copyImageToClipboard(menu.elementId).catch(console.error);
					appStore.closeImageContextMenu();
				}}>
				<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
				</svg>
				<span class="ctx-label">Copy to clipboard</span>
			</button>
			<button class="ctx-btn"
				onclick={() => {
					appStore.downloadImage(menu.elementId).catch(console.error);
					appStore.closeImageContextMenu();
				}}>
				<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
				</svg>
				<span class="ctx-label">Download image…</span>
			</button>
		{/if}
		<button class="ctx-btn ctx-danger"
			onclick={() => {
				if (element.type === 'image' && appStore.activeProjectId) {
					const d = element.data as MoodImageData;
					if (appStore.countFilenameUsages(d.filename, menu.elementId) === 0) {
						import('@tauri-apps/api/core').then(({ invoke }) =>
							invoke('delete_image', { projectId: appStore.activeProjectId, filename: d.filename }).catch(console.error)
						);
					}
				}
				appStore.removeElement(menu.elementId);
				appStore.closeImageContextMenu();
			}}>
			<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
			</svg>
			<span class="ctx-label">Delete</span>
		</button>
	</div>
{/if}

<style>
	.ctx-overlay {
		position: fixed;
		z-index: 200000;
		width: 180px;
		padding: 4px;
		border-radius: 12px;
		background: var(--bg-secondary);
		box-shadow: 0 12px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
	}
	.ctx-btn {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 13px;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}
	.ctx-btn:hover { background: var(--bg-hover); }
	.ctx-icon {
		flex: 0 0 16px;
		width: 16px;
		height: 16px;
		opacity: 0.85;
	}
	.ctx-label { flex: 1 1 auto; }
	.ctx-check { flex: 0 0 auto; font-size: 12px; }
	.ctx-danger { color: #ef4444; }
	.ctx-danger:hover { background: rgba(239,68,68,0.08); }
</style>
