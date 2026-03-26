<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { Tool } from '$lib/types';

	const tools: { id: Tool; label: string; icon: string }[] = [
		{ id: 'select', label: 'Select (V)', icon: 'cursor' },
		{ id: 'arrow', label: 'Arrow (A)', icon: 'arrow' },
		{ id: 'circle', label: 'Circle (C)', icon: 'circle' },
		{ id: 'text', label: 'Text (T)', icon: 'text' }
	];

	function handleKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if ((e.target as HTMLElement)?.isContentEditable) return;
		if (e.key === 'v' || e.key === 'V') appStore.setTool('select');
		if (e.key === 'a' || e.key === 'A') appStore.setTool('arrow');
		if (e.key === 'c' || e.key === 'C') appStore.setTool('circle');
		if (e.key === 't' || e.key === 'T') appStore.setTool('text');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="toolbar">
	<div class="tool-group">
		{#each tools as tool}
			<button
				class="tool-btn {appStore.activeTool === tool.id ? 'active' : ''}"
				onclick={() => appStore.setTool(tool.id)}
				title={tool.label}
			>
				{#if tool.icon === 'cursor'}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>
				{:else if tool.icon === 'arrow'}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
				{:else if tool.icon === 'circle'}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
				{:else if tool.icon === 'text'}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
				{/if}
			</button>
		{/each}
	</div>

	{#if appStore.activeTool !== 'select'}
		<div class="color-picker">
			<span style="font-size:12px;color:var(--text-muted)">Color</span>
			<input type="color" value={appStore.shapeColor}
				oninput={(e) => appStore.setShapeColor(e.currentTarget.value)}
				style="width:28px;height:28px;border:none;background:transparent;cursor:pointer;padding:0" />
		</div>
	{/if}

	<div style="flex:1"></div>

	{#if appStore.activeVibe}
		<span class="breadcrumb">
			{appStore.activeProject?.name} &middot; {appStore.activeVibe.name}
		</span>
	{/if}

	<div class="action-btns">
		<!-- Snap toggle -->
		<button class="icon-btn {appStore.snapEnabled ? 'snap-on' : 'muted'}" onclick={() => appStore.toggleSnap()}
			title="{appStore.snapEnabled ? 'Snap ON' : 'Snap OFF'}">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 7h4"/><path d="M7 10v4"/><path d="M14 17h-4"/><path d="M17 14v-4"/></svg>
		</button>
		<!-- GIF toggle -->
		<button class="icon-btn {appStore.animateGifs ? '' : 'muted'}" onclick={() => appStore.toggleAnimateGifs()}
			title="{appStore.animateGifs ? 'Pause GIFs' : 'Play GIFs'}">
			{#if appStore.animateGifs}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
			{/if}
		</button>
		<button class="icon-btn" onclick={() => appStore.exportMoo()} title="Export .moo">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
		</button>
		<button class="icon-btn" onclick={() => appStore.toggleFocusMode()} title="Focus mode (F11)">
			{#if appStore.focusMode}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
			{/if}
		</button>
		<button class="icon-btn" onclick={() => appStore.toggleSettings()} title="Settings">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
		</button>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		padding: 8px 14px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--ui-border);
		gap: 12px;
	}
	.tool-group {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px;
		border-radius: 10px;
		background: var(--bg-primary);
	}
	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}
	.tool-btn:hover {
		color: var(--text-primary);
	}
	.tool-btn.active {
		background: var(--ui-accent);
		color: white;
		box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
	}
	.color-picker {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 16px;
		border-radius: 16px;
		background: var(--bg-primary);
	}
	.breadcrumb {
		padding: 8px 16px;
		border-radius: 12px;
		background: var(--bg-primary);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
	}
	.action-btns {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 12px;
	}
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 12px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}
	.icon-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}
	.icon-btn.muted { opacity: 0.4; }
	.icon-btn.snap-on { color: var(--ui-accent); }
</style>
