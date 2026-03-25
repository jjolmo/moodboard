<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';

	let editingId = $state<string | null>(null);
	let editingValue = $state('');
	let contextMenu = $state<{ x: number; y: number; vibeId: string } | null>(null);

	function finishEditing() {
		if (!editingId || !editingValue.trim() || !appStore.activeProjectId) { editingId = null; return; }
		appStore.renameVibe(appStore.activeProjectId, editingId, editingValue.trim());
		editingId = null;
	}
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') finishEditing();
		if (e.key === 'Escape') editingId = null;
	}
	function handleContextMenu(e: MouseEvent, vibeId: string) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, vibeId };
	}
	function closeContextMenu() { contextMenu = null; }
	function handleRename() {
		if (!contextMenu || !appStore.activeProject) return;
		const vibe = appStore.activeProject.vibes.find(v => v.id === contextMenu!.vibeId);
		if (vibe) { editingId = vibe.id; editingValue = vibe.name; }
		contextMenu = null;
	}
	function handleDelete() {
		if (!contextMenu || !appStore.activeProjectId) return;
		appStore.deleteVibe(appStore.activeProjectId, contextMenu.vibeId);
		contextMenu = null;
	}
	function handleNewVibe() {
		if (!appStore.activeProjectId) return;
		const count = (appStore.activeProject?.vibes.length ?? 0) + 1;
		appStore.createVibe(appStore.activeProjectId, `Vibe ${count}`);
	}
</script>

<svelte:window onclick={closeContextMenu} />

{#if !appStore.sidebarCollapsed}
<aside class="sidebar">
	<div class="sidebar-header">
		<span class="sidebar-label">Vibes</span>
		<div style="display:flex;gap:4px">
			<button onclick={handleNewVibe} title="New Vibe" class="sidebar-icon-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
			</button>
			<button onclick={() => appStore.toggleSidebar()} title="Collapse" class="sidebar-icon-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
			</button>
		</div>
	</div>

	<nav class="sidebar-nav">
		{#each appStore.activeProject?.vibes ?? [] as vibe}
			<button
				class="vibe-btn {appStore.activeVibeId === vibe.id ? 'active' : ''}"
				onclick={() => appStore.selectVibe(vibe.id)}
				oncontextmenu={(e) => handleContextMenu(e, vibe.id)}>
				<span class="vibe-dot" style="background:{vibe.color ?? '#6366f1'}"></span>
				{#if editingId === vibe.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input type="text" bind:value={editingValue} onblur={finishEditing} onkeydown={handleKeydown}
						class="vibe-edit" autofocus onclick={(e) => e.stopPropagation()} />
				{:else}
					<span class="vibe-name">{vibe.name}</span>
				{/if}
			</button>
		{/each}
	</nav>
</aside>
{:else}
<div class="sidebar-collapsed">
	<button onclick={() => appStore.toggleSidebar()} title="Expand sidebar" class="sidebar-icon-btn" style="margin-bottom:8px">
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
	</button>
	{#each appStore.activeProject?.vibes ?? [] as vibe}
		<button
			class="dot-btn {appStore.activeVibeId === vibe.id ? 'active' : ''}"
			onclick={() => appStore.selectVibe(vibe.id)}
			title={vibe.name}>
			<span class="vibe-dot-lg" style="background:{vibe.color ?? '#6366f1'}"></span>
		</button>
	{/each}
	<button onclick={handleNewVibe} class="dot-btn" title="New Vibe">
		<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
	</button>
</div>
{/if}

{#if contextMenu}
	<div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px">
		<button class="ctx-item" onclick={handleRename}>Rename</button>
		{#if (appStore.activeProject?.vibes.length ?? 0) > 1}
			<button class="ctx-item ctx-danger" onclick={handleDelete}>Delete</button>
		{/if}
	</div>
{/if}

<style>
	.sidebar {
		display: flex; flex-direction: column; height: 100%;
		width: 200px; flex-shrink: 0;
		background: var(--bg-secondary); border-right: 1px solid var(--ui-border);
	}
	.sidebar-collapsed {
		display: flex; flex-direction: column; align-items: center;
		height: 100%; width: 48px; flex-shrink: 0;
		background: var(--bg-secondary); border-right: 1px solid var(--ui-border);
		padding: 12px 0;
	}
	.sidebar-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 14px 12px 10px 14px;
	}
	.sidebar-label {
		font-size: 11px; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.12em; color: var(--text-muted);
	}
	.sidebar-icon-btn {
		display: flex; align-items: center; justify-content: center;
		width: 26px; height: 26px; border-radius: 6px;
		border: none; background: transparent; color: var(--text-muted);
		cursor: pointer; transition: all 0.15s;
	}
	.sidebar-icon-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
	.sidebar-nav {
		flex: 1; overflow-y: auto; padding: 0 8px 12px 8px;
		display: flex; flex-direction: column; gap: 2px;
	}
	.vibe-btn {
		display: flex; align-items: center; gap: 10px;
		width: 100%; padding: 7px 10px; border-radius: 8px;
		border: none; background: transparent; color: var(--text-secondary);
		font-size: 13px; text-align: left; cursor: pointer; transition: all 0.12s;
	}
	.vibe-btn:hover { background: var(--bg-hover); }
	.vibe-btn.active {
		background: var(--bg-tertiary); color: var(--text-primary); font-weight: 600;
	}
	.vibe-dot {
		width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0;
	}
	.vibe-dot-lg {
		width: 14px; height: 14px; border-radius: 4px;
	}
	.vibe-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.vibe-edit {
		flex: 1; padding: 3px 8px; border-radius: 6px; border: none;
		background: var(--bg-primary); color: var(--text-primary);
		font-size: 13px; outline: none; box-shadow: 0 0 0 2px var(--ui-accent);
	}
	.dot-btn {
		display: flex; align-items: center; justify-content: center;
		width: 32px; height: 32px; border-radius: 8px;
		border: none; background: transparent; color: var(--text-muted);
		cursor: pointer; transition: all 0.12s; margin-bottom: 4px;
	}
	.dot-btn:hover { background: var(--bg-hover); }
	.dot-btn.active { background: var(--bg-tertiary); }
	.ctx-menu {
		position: fixed; z-index: 9999; width: 160px; padding: 4px;
		border-radius: 12px; background: var(--bg-secondary);
		box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
	}
	.ctx-item {
		display: flex; align-items: center; width: 100%;
		padding: 8px 12px; border-radius: 8px; border: none;
		background: transparent; color: var(--text-primary);
		font-size: 13px; cursor: pointer; transition: all 0.1s;
	}
	.ctx-item:hover { background: var(--bg-hover); }
	.ctx-danger { color: #ef4444; }
	.ctx-danger:hover { background: rgba(239,68,68,0.08); }
</style>
