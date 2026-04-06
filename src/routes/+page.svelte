<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import ImageContextMenu from '$lib/components/ImageContextMenu.svelte';
	import TagGridView from '$lib/components/TagGridView.svelte';

	onMount(() => {
		appStore.loadAppState();
		window.addEventListener('beforeunload', () => { appStore.triggerSave(); });
		document.addEventListener('contextmenu', (e) => {
			const target = e.target as HTMLElement;
			if (!target.closest('[data-allow-context]')) e.preventDefault();
		});
		const interval = setInterval(() => { appStore.triggerSave(); }, 60000);
		return () => clearInterval(interval);
	});
</script>

{#if !appStore.initialized}
	<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--bg-primary);">
		<p style="color:var(--text-secondary)">Loading...</p>
	</div>
{:else}
	<div style="display:flex;height:100vh;background:var(--bg-primary);">
		{#if !appStore.focusMode}
			<Sidebar />
		{/if}
		<div style="display:flex;flex:1;flex-direction:column;min-width:0;">
			{#if !appStore.focusMode}
				<Toolbar />
			{/if}
			<Canvas />
		</div>
		<SettingsPanel />
		<Lightbox />
		<ImageContextMenu />
		<TagGridView />
	</div>

	<!-- Focus mode: floating exit button -->
	{#if appStore.focusMode}
		<button onclick={() => appStore.toggleFocusMode()}
			style="position:fixed;bottom:16px;right:16px;z-index:99998;padding:8px 16px;border-radius:10px;border:none;background:var(--bg-secondary);color:var(--text-secondary);font-size:12px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.1);opacity:0.6;transition:opacity 0.2s;"
			onmouseenter={(e) => e.currentTarget.style.opacity = '1'}
			onmouseleave={(e) => e.currentTarget.style.opacity = '0.6'}>
			Exit focus (Esc)
		</button>
	{/if}
{/if}
