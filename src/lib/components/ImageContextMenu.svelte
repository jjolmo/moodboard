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
			{#if element.alwaysOnTop}<span style="margin-right:4px">&#10003;</span>{/if}Always on top
		</button>
		{#if element.type === 'image'}
			<button class="ctx-btn"
				onclick={() => {
					appStore.selectElement(menu.elementId);
					appStore.copyAsReference();
					appStore.closeImageContextMenu();
				}}>
				Copy as reference
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
			Delete
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
	.ctx-danger { color: #ef4444; }
	.ctx-danger:hover { background: rgba(239,68,68,0.08); }
</style>
