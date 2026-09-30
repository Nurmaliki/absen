/**
 * Camera controller with comprehensive error handling.
 * All MediaDevices errors are mapped to plain-Indonesian, actionable messages.
 */

export type CameraErrorCode =
	| 'NotAllowedError'
	| 'NotFoundError'
	| 'NotReadableError'
	| 'OverconstrainedError'
	| 'SecurityError'
	| 'NotSupportedError'
	| 'unknown';

export interface CameraError {
	code: CameraErrorCode;
	message: string;
	hint: string;
}

export const CAMERA_MESSAGES: Record<CameraErrorCode, { message: string; hint: string }> = {
	NotAllowedError: {
		message: 'Akses kamera ditolak.',
		hint: 'Aktifkan izin kamera pada pengaturan browser kemudian coba kembali.'
	},
	NotFoundError: {
		message: 'Kamera tidak ditemukan.',
		hint: 'Pastikan perangkat memiliki kamera dan tidak digunakan aplikasi lain.'
	},
	NotReadableError: {
		message: 'Kamera tidak dapat dibaca.',
		hint: 'Tutup aplikasi lain yang mungkin sedang menggunakan kamera, lalu coba lagi.'
	},
	OverconstrainedError: {
		message: 'Resolusi kamera tidak didukung.',
		hint: 'Coba gunakan kamera lain atau muat ulang halaman.'
	},
	SecurityError: {
		message: 'Akses kamera diblokir oleh kebijakan keamanan.',
		hint: 'Akses kamera memerlukan HTTPS. Buka aplikasi melalui HTTPS atau localhost.'
	},
	NotSupportedError: {
		message: 'Browser tidak mendukung akses kamera.',
		hint: 'Gunakan browser modern seperti Chrome, Edge, atau Safari terbaru.'
	},
	unknown: {
		message: 'Terjadi kesalahan saat mengakses kamera.',
		hint: 'Muat ulang halaman lalu coba kembali.'
	}
};

export function mapCameraError(error: unknown): CameraError {
	const name = (error as DOMException)?.name as CameraErrorCode | undefined;
	const code: CameraErrorCode = name && name in CAMERA_MESSAGES ? name : 'unknown';
	return { code, ...CAMERA_MESSAGES[code] };
}

export interface CameraHandle {
	stream: MediaStream;
	stop: () => void;
}

/** True only on a secure context where getUserMedia is actually meaningful. */
export function isCameraSupported(): boolean {
	if (typeof navigator === 'undefined') return false;
	return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

/** Start a camera stream, preferring the rear camera for classroom capture. */
export async function startCamera(options: {
	deviceId?: string;
	facingMode?: 'user' | 'environment';
}): Promise<CameraHandle> {
	if (!isCameraSupported()) {
		const err = CAMERA_MESSAGES.NotSupportedError;
		throw Object.assign(new Error(err.message), { code: 'NotSupportedError', hint: err.hint });
	}

	const constraints: MediaStreamConstraints = {
		video: options.deviceId
			? { deviceId: { exact: options.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
			: {
					facingMode: options.facingMode ?? 'user',
					width: { ideal: 640 },
					height: { ideal: 480 }
				},
		audio: false
	};

	const stream = await navigator.mediaDevices.getUserMedia(constraints);
	return {
		stream,
		stop: () => stream.getTracks().forEach((track) => track.stop())
	};
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
	if (!isCameraSupported() || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
		return [];
	}
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices.filter((d) => d.kind === 'videoinput');
	} catch {
		return [];
	}
}

/** Bridge a MediaStream to a <video> element and resolve once metadata is ready. */
export function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
	video.srcObject = stream;
	video.muted = true;
	video.playsInline = true;
	return new Promise((resolve, reject) => {
		const onLoaded = () => {
			video.removeEventListener('loadedmetadata', onLoaded);
			video.play().then(resolve).catch(reject);
		};
		video.addEventListener('loadedmetadata', onLoaded);
	});
}

/** Capture the current video frame into a canvas suitable for the face engine. */
export function captureFrame(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
	targetWidth = 320
): HTMLCanvasElement {
	const ratio = video.videoHeight / (video.videoWidth || 1);
	const width = targetWidth;
	const height = Math.round(targetWidth * (ratio || 1));
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (ctx) {
		ctx.drawImage(video, 0, 0, width, height);
	}
	return canvas;
}
