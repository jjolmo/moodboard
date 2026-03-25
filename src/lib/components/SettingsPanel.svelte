<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import { invoke } from '@tauri-apps/api/core';

	let updateStatus = $state<string>('');
	let checking = $state(false);
	let desktopStatus = $state<string>('');
	const isLinux = navigator.userAgent.includes('Linux');

	async function checkUpdates() {
		checking = true;
		updateStatus = 'Checking...';
		try {
			const result: any = await invoke('check_for_updates');
			if (result.updateAvailable) {
				updateStatus = `v${result.latestVersion} available!`;
				if (confirm(`New version v${result.latestVersion} available. Download now?`)) {
					await invoke('download_and_apply_update', { downloadUrl: result.downloadUrl });
					updateStatus = 'Downloaded! Restart to update.';
				}
			} else {
				updateStatus = `Up to date (v${result.currentVersion})`;
			}
		} catch (e) {
			updateStatus = 'Could not check';
		}
		checking = false;
	}
</script>

{#if appStore.showSettings}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="settings-backdrop" onclick={() => appStore.toggleSettings()}></div>

	<div class="settings-panel">
		<div class="settings-title">Settings</div>

		<div class="settings-section">
			<div class="settings-section-label">Appearance</div>
			<div class="theme-grid">
				<button class="theme-card {appStore.theme === 'light' ? 'active' : ''}" onclick={() => appStore.setTheme('light')}>
					<div class="theme-icon light-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
					</div>
					<span>Light</span>
				</button>
				<button class="theme-card {appStore.theme === 'dark' ? 'active' : ''}" onclick={() => appStore.setTheme('dark')}>
					<div class="theme-icon dark-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
					</div>
					<span>Dark</span>
				</button>
			</div>
		</div>

		<div class="settings-divider"></div>

		<div class="settings-section">
			<div class="settings-section-label">Canvas</div>
			<div style="display:flex;flex-direction:column;gap:12px">
				<div style="display:flex;align-items:center;gap:12px">
					<span style="font-size:13px;color:var(--text-secondary)">Zoom speed</span>
					<input type="range" min="1" max="30" value={appStore.zoomSensitivity}
						oninput={(e) => appStore.setZoomSensitivity(parseInt(e.currentTarget.value))}
						style="flex:1;accent-color:var(--ui-accent)" />
					<span style="font-size:12px;color:var(--text-muted);min-width:20px;text-align:right">{appStore.zoomSensitivity}</span>
				</div>
				<div style="display:flex;align-items:center;gap:12px">
					<span style="font-size:13px;color:var(--text-secondary)">Snap distance</span>
					<input type="range" min="1" max="30" value={appStore.snapDistance}
						oninput={(e) => appStore.setSnapDistance(parseInt(e.currentTarget.value))}
						style="flex:1;accent-color:var(--ui-accent)" />
					<span style="font-size:12px;color:var(--text-muted);min-width:28px;text-align:right">{appStore.snapDistance}px</span>
				</div>
				<div style="display:flex;align-items:center;justify-content:space-between">
					<span style="font-size:13px;color:var(--text-secondary)">Rounded corners</span>
					<button onclick={() => appStore.toggleRoundedCorners()}
						style="width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;position:relative;background:{appStore.roundedCorners ? 'var(--ui-accent)' : 'var(--bg-tertiary)'};transition:background 0.2s;">
						<span style="position:absolute;top:2px;{appStore.roundedCorners ? 'right:2px' : 'left:2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.2);"></span>
					</button>
				</div>
			</div>
		</div>

		<div class="settings-divider"></div>

		<div class="settings-section">
			<div class="settings-section-label">Project File</div>
			<div class="settings-actions">
				<button class="btn-primary" onclick={() => { appStore.exportMoo(); appStore.toggleSettings(); }}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
					Export .moo
				</button>
				<button class="btn-secondary" onclick={() => { appStore.importMoo(); appStore.toggleSettings(); }}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
					Import .moo
				</button>
			</div>
		</div>

		<div class="settings-divider"></div>

		<div class="settings-section">
			<div style="display:flex;align-items:center;justify-content:space-between;">
				<button class="btn-secondary" style="flex:1" onclick={checkUpdates} disabled={checking}>
					{checking ? 'Checking...' : 'Check for updates'}
				</button>
			</div>
			{#if updateStatus}
				<div style="margin-top:8px;font-size:12px;color:var(--text-muted);text-align:center;">{updateStatus}</div>
			{/if}
			{#if isLinux}
				<button class="btn-secondary" style="width:100%;margin-top:8px" onclick={async () => {
					try {
						const msg = await invoke('install_desktop_file');
						desktopStatus = String(msg);
					} catch (e) { desktopStatus = 'Failed: ' + e; }
				}}>
					Install .desktop shortcut
				</button>
				{#if desktopStatus}
					<div style="margin-top:6px;font-size:11px;color:var(--text-muted);text-align:center;">{desktopStatus}</div>
				{/if}
			{/if}
		</div>

		<div class="settings-footer">Ctrl+0 to reset view</div>
	</div>
{/if}

<style>
	.settings-backdrop {
		position: fixed; inset: 0; z-index: 9998;
		background: rgba(0,0,0,0.12);
		backdrop-filter: blur(2px);
	}
	.settings-panel {
		position: fixed; right: 20px; top: 64px; z-index: 9999;
		width: 320px;
		border-radius: 20px;
		background: var(--bg-secondary);
		box-shadow: 0 24px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
		overflow: hidden;
	}
	.settings-title {
		padding: 24px 24px 8px;
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
	}
	.settings-section {
		padding: 20px 24px;
	}
	.settings-section-label {
		margin-bottom: 16px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--text-muted);
	}
	.settings-divider {
		margin: 0 24px;
		border-top: 1px solid var(--ui-border);
	}
	.theme-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.theme-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 20px 16px;
		border-radius: 16px;
		border: none;
		background: var(--bg-primary);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.theme-card:hover { background: var(--bg-hover); }
	.theme-card.active {
		outline: 2px solid var(--ui-accent);
		outline-offset: -2px;
		color: var(--ui-accent);
	}
	.theme-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px; height: 48px;
		border-radius: 14px;
	}
	.light-icon { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
	.dark-icon { background: #1e1e2e; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
	.settings-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.btn-primary, .btn-secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 12px 20px;
		border-radius: 14px;
		border: none;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-primary {
		background: var(--ui-accent);
		color: white;
		box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
	}
	.btn-primary:hover { filter: brightness(1.1); }
	.btn-secondary {
		background: var(--bg-primary);
		color: var(--text-primary);
		box-shadow: inset 0 0 0 1px var(--ui-border);
	}
	.btn-secondary:hover { background: var(--bg-hover); }
	.settings-footer {
		padding: 12px 24px;
		background: var(--bg-primary);
		text-align: center;
		font-size: 11px;
		color: var(--text-muted);
		opacity: 0.6;
	}
</style>
