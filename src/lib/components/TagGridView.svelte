<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';

	const tag = $derived(appStore.tags.find(t => t.id === appStore.tagGridViewId) ?? null);
	const count = $derived(appStore.tagGridViewId ? appStore.getTaggedImages(appStore.tagGridViewId).length : 0);
</script>

{#if tag && appStore.tagGridViewId}
	<div class="tag-banner">
		<span class="tag-dot" style="background:{tag.color}"></span>
		<span class="tag-label">Viewing: <strong>{tag.name}</strong></span>
		<span class="tag-count">{count} image{count !== 1 ? 's' : ''}</span>
		<button class="close-btn" onclick={() => appStore.closeTagGridView()} title="Exit tag view">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
		</button>
	</div>
{/if}

<style>
	.tag-banner {
		position: fixed; top: 56px; left: 50%; transform: translateX(-50%);
		z-index: 99999; display: flex; align-items: center; gap: 8px;
		padding: 6px 12px 6px 10px; border-radius: 10px;
		background: var(--bg-secondary); box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
	}
	.tag-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
	.tag-label { font-size: 12px; color: var(--text-primary); white-space: nowrap; }
	.tag-count { font-size: 11px; color: var(--text-muted); }
	.close-btn {
		display: flex; align-items: center; justify-content: center;
		width: 22px; height: 22px; border-radius: 6px;
		border: none; background: transparent; color: var(--text-muted);
		cursor: pointer; margin-left: 4px;
	}
	.close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
</style>
