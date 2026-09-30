/** Toast notifications — global, non-blocking feedback for important actions. */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
	timeoutMs: number;
}

let counter = 0;

function toastState() {
	let toasts = $state<Toast[]>([]);

	function push(kind: ToastKind, message: string, timeoutMs = 4000): number {
		const id = ++counter;
		toasts = [...toasts, { id, kind, message, timeoutMs }];
		if (timeoutMs > 0) {
			setTimeout(() => dismiss(id), timeoutMs);
		}
		return id;
	}

	function dismiss(id: number): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	return {
		get items() {
			return toasts;
		},
		push,
		dismiss,
		success(message: string, timeoutMs?: number) {
			return push('success', message, timeoutMs);
		},
		error(message: string, timeoutMs?: number) {
			return push('error', message, timeoutMs ?? 6000);
		},
		info(message: string, timeoutMs?: number) {
			return push('info', message, timeoutMs);
		},
		warning(message: string, timeoutMs?: number) {
			return push('warning', message, timeoutMs ?? 5000);
		}
	};
}

export const toasts = toastState();
