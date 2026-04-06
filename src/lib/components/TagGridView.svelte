<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { MoodImageData } from '$lib/types';
	import { getCachedImage } from '$lib/utils/imageCache';

	const tag = $derived(appStore.tags.find(t => t.id === appStore.tagGridViewId) ?? null);
	const taggedImages = $derived(appStore.tagGridViewId ? appStore.getTaggedImages(appStore.tagGridViewId) : []);

	let thumbnails = $state<Map<string, string>>(new Map());

	$effect(() => {
		if (!appStore.tagGridViewId || !appStore.activeProjectId) return;
		const pid = appStore.activeProjectId;
		for (const item of taggedImages) {
			const fn = (item.element.data as MoodImageData).filename;
			const key = `${pid}/${fn}`;
			if (!thumbnails.has(key)) {
				getCachedImage(pid, fn).then((src) => {
					thumbnails = new Map(thumbnails).set(key, src);
				}).catch(console.error);
			}
		}
	});

	function navigateTo(vibeId: string, elementId: string) {
		appStore.selectVibe(vibeId);
		appStore.selectElement(elementId);
		appStore.closeTagGridView();
	}
</script>

{#if tag && appStore.tagGridViewId}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={() => appStore.closeTagGridView()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="panel" onclick={(e) => e.stopPropagation()}>
			<div class="panel-header">
				<div style="display:flex;align-items:center;gap:8px;">
					<span class="tag-dot" style="background:{tag.color}"></span>
					<span class="panel-title">{tag.name}</span>
					<span class="panel-count">{taggedImages.length} image{taggedImages.length !== 1 ? 's' : ''}</span>
				</div>
				<button class="close-btn" onclick={() => appStore.closeTagGridView()}>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>

			{#if taggedImages.length === 0}
				<div class="empty">No images tagged with "{tag.name}" yet</div>
			{:else}
				<div class="grid">
					{#each taggedImages as item}
						{@const fn = (item.element.data as MoodImageData).filename}
						{@const key = `${appStore.activeProjectId}/${fn}`}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="grid-item" onclick={() => navigateTo(item.vibeId, item.element.id)}>
							{#if thumbnails.has(key)}
								<img src={thumbnails.get(key)} alt="" draggable="false" />
							{:else}
								<div class="loading">Loading...</div>
							{/if}
							<div class="vibe-label">{item.vibeName}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed; inset: 0; z-index: 100000;
		background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
		display: flex; align-items: center; justify-content: center;
	}
	.panel {
		background: var(--bg-secondary); border-radius: 16px;
		width: min(90vw, 800px); max-height: 80vh;
		display: flex; flex-direction: column;
		box-shadow: 0 24px 80px rgba(0,0,0,0.3);
	}
	.panel-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 16px 20px; border-bottom: 1px solid var(--ui-border);
	}
	.panel-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
	.panel-count { font-size: 12px; color: var(--text-muted); }
	.tag-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
	.close-btn {
		display: flex; align-items: center; justify-content: center;
		width: 32px; height: 32px; border-radius: 8px;
		border: none; background: transparent; color: var(--text-muted);
		cursor: pointer; transition: all 0.15s;
	}
	.close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
	.grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px; padding: 16px 20px; overflow-y: auto;
	}
	.grid-item {
		position: relative; aspect-ratio: 1; border-radius: 8px;
		overflow: hidden; cursor: pointer; background: var(--bg-tertiary);
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.grid-item:hover { transform: scale(1.03); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
	.grid-item img {
		width: 100%; height: 100%; object-fit: cover;
		pointer-events: none;
	}
	.vibe-label {
		position: absolute; bottom: 0; left: 0; right: 0;
		padding: 4px 8px; font-size: 10px; font-weight: 600;
		color: white; background: linear-gradient(transparent, rgba(0,0,0,0.6));
		text-overflow: ellipsis; overflow: hidden; white-space: nowrap;
	}
	.loading {
		display: flex; align-items: center; justify-content: center;
		width: 100%; height: 100%; color: var(--text-muted); font-size: 11px;
	}
	.empty {
		padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;
	}
</style>
