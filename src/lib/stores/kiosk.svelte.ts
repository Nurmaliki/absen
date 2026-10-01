/**
 * Kiosk mode.
 *
 * A teacher may leave a tablet at the front of the classroom running the scanner. In kiosk
 * mode we hide the sidebar/bottom-nav and request fullscreen so students can only see the
 * camera, the name list, and the running counters — nothing that could be tapped away.
 *
 * The state lives in a small reactive store so the root layout (which renders the chrome)
 * and the attendance page (which offers the toggle) stay in sync without prop drilling.
 */

function kioskState() {
	let active = $state(false);

	return {
		get active() {
			return active;
		},
		async enter(): Promise<void> {
			active = true;
			try {
				// Best-effort: fullscreen may be rejected (iOS Safari, permissions). The UI still
				// enters kiosk layout even if the browser refuses to go fullscreen.
				await document.documentElement.requestFullscreen?.();
			} catch {
				/* ignore */
			}
		},
		async exit(): Promise<void> {
			active = false;
			try {
				if (document.fullscreenElement) await document.exitFullscreen?.();
			} catch {
				/* ignore */
			}
		},
		/** Sync with the browser when the user leaves fullscreen with Esc/system gesture. */
		syncFromFullscreen(): void {
			if (!document.fullscreenElement) active = false;
		}
	};
}

export const kiosk = kioskState();
