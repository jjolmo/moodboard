<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';

	// ── Vibe editing ────────────────────────────────
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
		tagContextMenu = null;
	}
	function closeContextMenu() { contextMenu = null; showColorPicker = false; tagContextMenu = null; folderContextMenu = null; }
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

	const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#f97316','#06b6d4'];
	let showColorPicker = $state(false);

	function handleChangeColor(color: string) {
		if (!contextMenu || !appStore.activeProjectId) return;
		appStore.updateVibeColor(appStore.activeProjectId, contextMenu.vibeId, color);
		contextMenu = null;
		showColorPicker = false;
	}
	function toggleColorPicker() { showColorPicker = !showColorPicker; }
	function handleNewVibe() {
		if (!appStore.activeProjectId) return;
		const count = (appStore.activeProject?.vibes.length ?? 0) + 1;
		appStore.createVibe(appStore.activeProjectId, `Vibe ${count}`);
	}

	// ── Tag editing ─────────────────────────────────
	let creatingTag = $state(false);
	let newTagName = $state('');
	let tagContextMenu = $state<{ x: number; y: number; tagId: string } | null>(null);
	let editingTagId = $state<string | null>(null);
	let editingTagValue = $state('');
	let showTagColorPicker = $state(false);

	function handleCreateTag() {
		if (!newTagName.trim()) { creatingTag = false; return; }
		appStore.createTag(newTagName.trim());
		newTagName = '';
		creatingTag = false;
	}
	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleCreateTag();
		if (e.key === 'Escape') { creatingTag = false; newTagName = ''; }
	}
	function handleTagContextMenu(e: MouseEvent, tagId: string) {
		e.preventDefault();
		tagContextMenu = { x: e.clientX, y: e.clientY, tagId };
		contextMenu = null;
	}
	function handleTagRename() {
		if (!tagContextMenu) return;
		const tag = appStore.tags.find(t => t.id === tagContextMenu!.tagId);
		if (tag) { editingTagId = tag.id; editingTagValue = tag.name; }
		tagContextMenu = null;
	}
	function finishTagEditing() {
		if (!editingTagId || !editingTagValue.trim()) { editingTagId = null; return; }
		appStore.renameTag(editingTagId, editingTagValue.trim());
		editingTagId = null;
	}
	function handleTagEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') finishTagEditing();
		if (e.key === 'Escape') editingTagId = null;
	}
	function handleDeleteTag() {
		if (!tagContextMenu) return;
		appStore.deleteTag(tagContextMenu.tagId);
		tagContextMenu = null;
	}
	// ── Folder editing ──────────────────────────────
	let folderContextMenu = $state<{ x: number; y: number; path: string } | null>(null);
	let syncingFolder = $state<string | null>(null);

	function handleFolderContextMenu(e: MouseEvent, path: string) {
		e.preventDefault();
		folderContextMenu = { x: e.clientX, y: e.clientY, path };
		contextMenu = null;
		tagContextMenu = null;
	}
	async function handleSyncFolder() {
		if (!folderContextMenu) return;
		const path = folderContextMenu.path;
		folderContextMenu = null;
		syncingFolder = path;
		try {
			await appStore.syncWatchedFolder(path);
		} finally {
			syncingFolder = null;
		}
	}
	function handleRemoveFolder() {
		if (!folderContextMenu) return;
		appStore.removeWatchedFolder(folderContextMenu.path);
		folderContextMenu = null;
	}

	function handleTagChangeColor(color: string) {
		if (!tagContextMenu) return;
		appStore.updateTagColor(tagContextMenu.tagId, color);
		tagContextMenu = null;
		showTagColorPicker = false;
	}
</script>

<svelte:window onclick={closeContextMenu} />

{#if !appStore.sidebarCollapsed}
<aside class="sidebar">
	<!-- Vibes section -->
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
				class="vibe-btn {appStore.activeVibeId === vibe.id && !appStore.tagGridViewId ? 'active' : ''}"
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

	<!-- Watched Folders section -->
	<div class="sidebar-divider"></div>
	<div class="sidebar-header">
		<span class="sidebar-label">Folders</span>
		<div style="display:flex;gap:4px">
			<button onclick={() => appStore.addWatchedFolder()} title="Watch folder" class="sidebar-icon-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
			</button>
		</div>
	</div>
	<nav class="sidebar-nav folder-nav">
		{#each appStore.watchedFolders as folder}
			{@const folderName = folder.path.split('/').pop() || folder.path}
			<button
				class="vibe-btn {appStore.activeVibeId === folder.vibeId && !appStore.tagGridViewId ? 'active' : ''}"
				onclick={() => appStore.selectVibe(folder.vibeId)}
				oncontextmenu={(e) => handleFolderContextMenu(e, folder.path)}
				title={folder.path}>
				<span style="font-size:13px;flex-shrink:0">📁</span>
				<span class="vibe-name">{folderName}</span>
			</button>
		{/each}
		{#if appStore.watchedFolders.length === 0}
			<div style="padding:6px 10px;font-size:11px;color:var(--text-muted);">No folders</div>
		{/if}
	</nav>

	<!-- Tags section -->
	<div class="sidebar-divider"></div>
	<div class="sidebar-header">
		<span class="sidebar-label">Tags</span>
		<div style="display:flex;gap:4px">
			{#if appStore.activeTagId}
				<button onclick={() => appStore.setActiveTag(null)} title="Exit tagging mode" class="sidebar-icon-btn" style="color:#10b981;font-size:10px;font-weight:700;">
					✓
				</button>
			{/if}
			<button onclick={() => { creatingTag = true; }} title="New Tag" class="sidebar-icon-btn">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
			</button>
		</div>
	</div>

	<nav class="sidebar-nav tag-nav">
		{#if creatingTag}
			<!-- svelte-ignore a11y_autofocus -->
			<input type="text" bind:value={newTagName} onblur={handleCreateTag} onkeydown={handleTagKeydown}
				class="vibe-edit" autofocus placeholder="Tag name..." style="margin:2px 0;" />
		{/if}
		{#each appStore.tags as tag}
			<button
				class="vibe-btn {appStore.activeTagId === tag.id ? 'tag-active' : ''} {appStore.tagGridViewId === tag.id ? 'tag-viewing' : ''}"
				onclick={() => appStore.setActiveTag(tag.id)}
				ondblclick={() => appStore.openTagGridView(tag.id)}
				oncontextmenu={(e) => handleTagContextMenu(e, tag.id)}>
				<span class="vibe-dot" style="background:{tag.color};border-radius:50%"></span>
				{#if editingTagId === tag.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input type="text" bind:value={editingTagValue} onblur={finishTagEditing} onkeydown={handleTagEditKeydown}
						class="vibe-edit" autofocus onclick={(e) => e.stopPropagation()} />
				{:else}
					<span class="vibe-name">{tag.name}</span>
					<span class="tag-count">{appStore.getTagUsageCount(tag.id)}</span>
				{/if}
			</button>
		{/each}
		{#if appStore.tags.length === 0 && !creatingTag}
			<div style="padding:6px 10px;font-size:11px;color:var(--text-muted);">No tags yet</div>
		{/if}
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

<!-- Vibe context menu -->
{#if contextMenu}
	<div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px">
		<button class="ctx-item" onclick={handleRename}>Rename</button>
		<div class="color-grid">
			{#each COLORS as color}
				<button class="color-swatch" style="background:{color}" onclick={() => handleChangeColor(color)} title={color}></button>
			{/each}
		</div>
		{#if (appStore.activeProject?.vibes.length ?? 0) > 1}
			<button class="ctx-item ctx-danger" onclick={handleDelete}>Delete</button>
		{/if}
	</div>
{/if}

<!-- Tag context menu -->
{#if tagContextMenu}
	<div class="ctx-menu" style="left:{tagContextMenu.x}px;top:{tagContextMenu.y}px">
		<button class="ctx-item" onclick={() => { appStore.setActiveTag(tagContextMenu!.tagId); tagContextMenu = null; }}>
			{appStore.activeTagId === tagContextMenu.tagId ? 'Exit tagging' : 'Tag images'}
		</button>
		<button class="ctx-item" onclick={() => { appStore.openTagGridView(tagContextMenu!.tagId); tagContextMenu = null; }}>
			View moodboard
		</button>
		<button class="ctx-item" onclick={handleTagRename}>Rename</button>
		<div class="color-grid">
			{#each COLORS as color}
				<button class="color-swatch" style="background:{color}" onclick={() => handleTagChangeColor(color)} title={color}></button>
			{/each}
		</div>
		<button class="ctx-item ctx-danger" onclick={handleDeleteTag}>Delete</button>
	</div>
{/if}

<!-- Folder context menu -->
{#if folderContextMenu}
	<div class="ctx-menu" style="left:{folderContextMenu.x}px;top:{folderContextMenu.y}px">
		<button class="ctx-item" onclick={handleSyncFolder}>
			{syncingFolder === folderContextMenu.path ? 'Syncing...' : 'Sync now'}
		</button>
		<button class="ctx-item ctx-danger" onclick={handleRemoveFolder}>Remove folder</button>
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
		overflow-y: auto; padding: 0 8px 8px 8px;
		display: flex; flex-direction: column; gap: 2px;
		flex-shrink: 0;
	}
	.tag-nav { flex-shrink: 1; overflow-y: auto; }
	.folder-nav { flex-shrink: 0; }
	.sidebar-divider {
		height: 1px; background: var(--ui-border); margin: 0 12px;
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
	.vibe-btn.tag-active {
		background: rgba(16,185,129,0.12); color: #10b981; font-weight: 600;
		box-shadow: inset 0 0 0 1px rgba(16,185,129,0.3);
	}
	.vibe-btn.tag-viewing {
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
	.tag-count {
		font-size: 10px; color: var(--text-muted); background: var(--bg-tertiary);
		padding: 1px 5px; border-radius: 8px; flex-shrink: 0;
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
	.color-grid {
		display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
		padding: 6px 8px;
	}
	.color-swatch {
		width: 22px; height: 22px; border-radius: 6px; border: 2px solid transparent;
		cursor: pointer; transition: all 0.12s;
	}
	.color-swatch:hover { border-color: var(--text-primary); transform: scale(1.15); }
</style>
