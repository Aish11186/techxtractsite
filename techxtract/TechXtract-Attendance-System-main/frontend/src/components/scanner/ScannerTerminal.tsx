'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { sound } from '@/lib/sound';
import { ScanResponse, EventItem } from '@/types';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Keyboard,
  Clock,
  UserCheck,
  RefreshCw,
  Sparkles,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

interface ScannerTerminalProps {
  event: EventItem;
  onAttendanceMarked?: () => void;
}

interface ScanLogItem {
  id: string;
  status: ScanResponse['status'];
  message: string;
  studentName?: string;
  enrollmentNo?: string;
  department?: string;
  attendanceStatus?: string;
  markedAt: string;
  rawIdentifier: string;
}

export function ScannerTerminal({ event, onAttendanceMarked }: ScannerTerminalProps) {
  const [identifier, setIdentifier] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [recentLogs, setRecentLogs] = useState<ScanLogItem[]>([]);
  const [mode, setMode] = useState<'USB' | 'CAMERA' | 'IMAGE'>('CAMERA'); // Default to CAMERA on mobile/web
  const [runningPresent, setRunningPresent] = useState(event.total_present || 0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [detectedLaserStatus, setDetectedLaserStatus] = useState<string>('Align barcode inside laser frame');
  const [cameraRetryKey, setCameraRetryKey] = useState(0);

  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const isBackendAssistingRef = useRef<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<any>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input continuously in USB mode
  useEffect(() => {
    if (mode === 'USB') {
      inputRef.current?.focus();
    }
  }, [mode, isProcessing, scanResult]);

  // Click anywhere in window to keep input focused in USB scanner mode
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (mode === 'USB' && inputRef.current && e.target !== inputRef.current) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'A' && tag !== 'INPUT') {
          inputRef.current.focus();
        }
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [mode]);

  // Handle camera scanner lifecycle with laser-band cropping & C++ backend assist
  useEffect(() => {
    let active = true;
    let cameraStream: MediaStream | null = null;
    let scanInterval: NodeJS.Timeout | null = null;

    if (mode === 'CAMERA') {
      const startCamera = async () => {
        setCameraError(null);
        setIsCameraActive(false);
        setDetectedLaserStatus('Align barcode in laser band');

        try {
          if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraError(
              "Live camera streaming requires a secure context (HTTPS) on mobile browsers."
            );
            return;
          }

          // 1. Acquire media stream with resilient constraints (tolerant to all mobile devices)
          const constraintOptions = [
            {
              video: {
                facingMode: { ideal: facingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            },
            {
              video: {
                facingMode: facingMode,
              },
              audio: false,
            },
            {
              video: {
                facingMode: { ideal: 'environment' },
              },
              audio: false,
            },
            {
              video: true,
              audio: false,
            },
          ];

          let stream: MediaStream | null = null;
          let lastMediaErr: any = null;

          for (const c of constraintOptions) {
            try {
              stream = await navigator.mediaDevices.getUserMedia(c);
              if (stream) break;
            } catch (err) {
              lastMediaErr = err;
            }
          }

          if (!stream) {
            throw lastMediaErr || new Error("Unable to access camera. Please verify permissions.");
          }

          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          cameraStream = stream;

          if (videoRef.current) {
            const v = videoRef.current;
            v.setAttribute('playsinline', 'true');
            v.setAttribute('webkit-playsinline', 'true');
            v.muted = true;
            v.srcObject = stream;
            v.onloadedmetadata = async () => {
              try {
                await v.play();
                setIsCameraActive(true);
              } catch (playErr) {
                console.warn('Autoplay deferred:', playErr);
              }
            };
            try {
              await v.play();
              setIsCameraActive(true);
            } catch (playErr) {}
          }

          // 2. Setup Native BarcodeDetector if supported by the browser
          let nativeDetector: any = null;
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              nativeDetector = new (window as any).BarcodeDetector({
                formats: [
                  'code_128',
                  'code_39',
                  'qr_code',
                  'ean_13',
                  'ean_8',
                  'upc_a',
                  'upc_e',
                  'data_matrix',
                ],
              });
            } catch (e) {
              nativeDetector = null;
            }
          }

          // 3. Setup ZXing as fallback/parallel engine with TRY_HARDER
          const zxBrowser = (await import('@zxing/browser')) as any;
          const zxLibrary = (await import('@zxing/library')) as any;
          const { BrowserMultiFormatReader } = zxBrowser;
          const { DecodeHintType, BarcodeFormat } = zxLibrary;

          // Critical monkey-patch for upstream @zxing/browser bug where this.tempCanvasElement is undefined
          const patchLuminance = (cls: any) => {
            if (cls && cls.prototype && !cls.prototype.__patched) {
              cls.prototype.__patched = true;
              cls.prototype.getTempCanvasElement = function () {
                if (!this.tempCanvasElement) {
                  const doc = this.canvas && this.canvas.ownerDocument ? this.canvas.ownerDocument : document;
                  const tempCanvasElement = doc.createElement('canvas');
                  tempCanvasElement.width = this.canvas.width;
                  tempCanvasElement.height = this.canvas.height;
                  this.tempCanvasElement = tempCanvasElement;
                }
                return this.tempCanvasElement;
              };
            }
          };
          patchLuminance(zxBrowser.HTMLCanvasElementLuminanceSource);
          patchLuminance(zxLibrary.HTMLCanvasElementLuminanceSource);

          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_128,
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_93,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const zxReader = new BrowserMultiFormatReader(hints);

          // 4. Laser-band focused frame processing loop
          let isScanningFrame = false;
          let lastBackendAssistTime = 0;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          const triggerBarcodeFound = (rawCode: string, method: string) => {
            const clean = rawCode.trim();
            if (!clean) return;
            const now = Date.now();
            if (clean === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2500) {
              return;
            }
            lastScannedCodeRef.current = clean;
            lastScannedTimeRef.current = now;
            setDetectedLaserStatus(`Scanned: ${clean}`);
            handleScanSubmit(clean, method);
          };

          scanInterval = setInterval(async () => {
            if (!active || isScanningFrame || !videoRef.current) return;
            const video = videoRef.current;
            if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

            isScanningFrame = true;
            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              // Laser Region of Interest (central 88% width, central 40% height)
              const cropW = Math.round(vw * 0.88);
              const cropH = Math.round(vh * 0.40);
              const cropX = Math.round((vw - cropW) / 2);
              const cropY = Math.round((vh - cropH) / 2);

              // Normalize canvas size for dense scanlines (800 x proportional height ~360)
              const normW = 800;
              const normH = Math.max(200, Math.round((cropH / cropW) * normW));

              if (canvas.width !== normW || canvas.height !== normH) {
                canvas.width = normW;
                canvas.height = normH;
              }

              if (ctx) {
                // Tier 1 & 2: Draw central laser crop region
                ctx.filter = 'none';
                ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, normW, normH);

                // Tier 1: Hardware-accelerated Native BarcodeDetector (if supported)
                if (nativeDetector) {
                  try {
                    const barcodes = await nativeDetector.detect(canvas);
                    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                      triggerBarcodeFound(barcodes[0].rawValue, 'CAMERA_NATIVE');
                      isScanningFrame = false;
                      return;
                    }
                  } catch (detErr) {}
                }

                // Tier 2: Laser-band ZXing decode
                try {
                  const result = await zxReader.decodeFromCanvas(canvas);
                  if (result && result.getText()) {
                    triggerBarcodeFound(result.getText(), 'CAMERA_ZXING');
                    isScanningFrame = false;
                    return;
                  }
                } catch (zxErr) {}

                // Tier 3: Inverted laser frame for dark-mode screens & inverted badges
                try {
                  ctx.filter = 'invert(1)';
                  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, normW, normH);
                  ctx.filter = 'none';
                  const invResult = await zxReader.decodeFromCanvas(canvas);
                  if (invResult && invResult.getText()) {
                    triggerBarcodeFound(invResult.getText(), 'CAMERA_INVERTED');
                    isScanningFrame = false;
                    return;
                  }
                } catch (invErr) {}

                // Tier 4: Concurrent C++ backend assist (every 400ms)
                const now = Date.now();
                if (now - lastBackendAssistTime > 400 && !isBackendAssistingRef.current) {
                  lastBackendAssistTime = now;
                  isBackendAssistingRef.current = true;
                  // Re-draw normal laser crop without invert filter for backend
                  ctx.filter = 'none';
                  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, normW, normH);
                  canvas.toBlob(
                    async (blob) => {
                      if (!blob || !active) {
                        isBackendAssistingRef.current = false;
                        return;
                      }
                      try {
                        const serverRes: ScanResponse = await api.scanAttendanceImage(event.id, blob);
                        if (
                          serverRes &&
                          (serverRes.status === 'SUCCESS' ||
                            serverRes.status === 'DUPLICATE' ||
                            serverRes.status === 'UNREGISTERED' ||
                            (serverRes.status === 'INVALID_IDENTIFIER' && !serverRes.message.includes('Could not decode')))
                        ) {
                          const decodedCode =
                            serverRes.student?.barcode_value ||
                            serverRes.student?.enrollment_no ||
                            'LIVE_FRAME';
                          const timeNow = Date.now();
                          if (
                            decodedCode !== lastScannedCodeRef.current ||
                            timeNow - lastScannedTimeRef.current >= 2500
                          ) {
                            lastScannedCodeRef.current = decodedCode;
                            lastScannedTimeRef.current = timeNow;
                            setDetectedLaserStatus(
                              `Verified: ${serverRes.student?.name || decodedCode}`
                            );
                            applyScanResponse(serverRes, decodedCode);
                          }
                        }
                      } catch (e) {
                        // Silent on non-match frames
                      } finally {
                        isBackendAssistingRef.current = false;
                      }
                    },
                    'image/jpeg',
                    0.82
                  );
                }
              }
            } catch (frameErr) {
            } finally {
              isScanningFrame = false;
            }
          }, 120);

        } catch (err: any) {
          setIsCameraActive(false);
          setCameraError(
            err.message ||
              "Unable to start continuous camera stream."
          );
        }
      };

      startCamera();
    }

    return () => {
      active = false;
      setIsCameraActive(false);
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [mode, facingMode, cameraRetryKey]);

  const applyScanResponse = (response: ScanResponse, rawCode: string) => {
    setScanResult(response);

    if (response.status === 'SUCCESS') {
      sound.playSuccess();
      setRunningPresent((prev) => prev + 1);
      if (onAttendanceMarked) onAttendanceMarked();
    } else if (response.status === 'DUPLICATE') {
      sound.playDuplicate();
    } else {
      sound.playError();
    }

    const logEntry: ScanLogItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      status: response.status,
      message: response.message,
      studentName: response.student?.name,
      enrollmentNo: response.student?.enrollment_no,
      department: response.student?.department,
      attendanceStatus: response.attendance_status,
      markedAt: new Date().toLocaleTimeString(),
      rawIdentifier: rawCode,
    };

    setRecentLogs((prev) => [logEntry, ...prev.slice(0, 19)]);
  };

  // Handle direct barcode photo/screenshot upload with dark-mode screenshot support
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    try {
      // 1. Primary: High-precision server-side Code 128 / zxingcpp decoder
      try {
        const serverRes: ScanResponse = await api.scanAttendanceImage(event.id, file);
        if (serverRes) {
          if (
            serverRes.status === 'SUCCESS' ||
            serverRes.status === 'DUPLICATE' ||
            serverRes.status === 'UNREGISTERED' ||
            (serverRes.status === 'INVALID_IDENTIFIER' && !serverRes.message.includes('Could not decode'))
          ) {
            applyScanResponse(serverRes, serverRes.student?.barcode_value || file.name);
            return;
          }
        }
      } catch (err) {
        // Fall back to client-side decoders
      }

      // 2. Client-side Native BarcodeDetector
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
          });
          const bitmap = await createImageBitmap(file);
          const detected = await detector.detect(bitmap);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            await handleScanSubmit(detected[0].rawValue.trim(), 'IMAGE_UPLOAD');
            return;
          }
        } catch (e) {}
      }

      // 3. Client-side ZXing with patch
      const zxBrowser = (await import('@zxing/browser')) as any;
      const zxLibrary = (await import('@zxing/library')) as any;
      const { BrowserMultiFormatReader } = zxBrowser;
      const { DecodeHintType, BarcodeFormat } = zxLibrary;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_93,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);

      // Try full image and inverted image via canvas
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = objectUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          try {
            const res = await reader.decodeFromCanvas(canvas);
            if (res && res.getText()) {
              URL.revokeObjectURL(objectUrl);
              await handleScanSubmit(res.getText().trim(), 'IMAGE_UPLOAD');
              return;
            }
          } catch (e) {}

          // Try inverted canvas
          try {
            ctx.filter = 'invert(1)';
            ctx.drawImage(img, 0, 0);
            ctx.filter = 'none';
            const invRes = await reader.decodeFromCanvas(canvas);
            if (invRes && invRes.getText()) {
              URL.revokeObjectURL(objectUrl);
              await handleScanSubmit(invRes.getText().trim(), 'IMAGE_UPLOAD');
              return;
            }
          } catch (e) {}
        }
      } catch (e) {
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      // Graceful fallback: show clean inline guidance
      sound.playError();
      setScanResult({
        status: 'INVALID_IDENTIFIER',
        message: 'Could not detect barcode from photo. Please ensure clear lighting, or enter the ID/Enrollment directly in the manual box.',
      });
    } catch (err: any) {
      sound.playError();
      setScanResult({
        status: 'INVALID_IDENTIFIER',
        message: 'Could not process photo. Please try again or type the student ID below.',
      });
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleScanSubmit = async (scannedCode: string, method = 'BARCODE') => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode || isProcessing) return;

    setIsProcessing(true);
    setIdentifier('');

    try {
      const response: ScanResponse = await api.scanAttendance(event.id, {
        student_identifier: cleanCode,
        scan_method: method,
        device_id: 'scanner-station-01',
      });

      applyScanResponse(response, cleanCode);
    } catch (err: any) {
      sound.playError();
      const errResponse: ScanResponse = {
        status: 'SERVER_ERROR',
        message: err.message || 'Server connection error while validating scan',
      };
      setScanResult(errResponse);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScanSubmit(identifier, 'BARCODE');
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Hidden Mobile Native Camera Capture Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageUpload}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Mode Segmented Selector Bar (Mobile Optimized) */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-md">
        <button
          type="button"
          onClick={() => setMode('CAMERA')}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            mode === 'CAMERA'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span className="truncate">Camera Scanner</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('IMAGE')}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            mode === 'IMAGE'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <ImageIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">Snap / Photo</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('USB')}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            mode === 'USB'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <Keyboard className="w-4 h-4 shrink-0" />
          <span className="truncate">USB Input</span>
        </button>
      </div>

      {/* Operational Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Present
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-0.5 font-mono">
              {runningPresent}
            </div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
            <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Registered
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-0.5 font-mono">
              {event.total_registered || 0}
            </div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Session Scans
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400 mt-0.5 font-mono">
              {recentLogs.length}
            </div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Status
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  event.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-500'
                }`}
              />
              <span className="text-xs sm:text-sm font-bold text-white font-mono">{event.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Scanner Viewport & Visual Feedback Card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
        {mode === 'USB' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                USB Scanner Input
              </label>
              <span className="text-[11px] text-neutral-400 hidden sm:inline">Point scanner & trigger</span>
            </div>

            <form onSubmit={onFormSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                spellCheck="false"
                disabled={isProcessing || event.status !== 'OPEN'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  event.status !== 'OPEN'
                    ? `Event is currently ${event.status}`
                    : 'Scan barcode or enter student identifier...'
                }
                className="w-full h-14 sm:h-16 rounded-xl border-2 border-neutral-700 bg-neutral-950 px-4 sm:px-5 text-base sm:text-lg font-mono text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition shadow-inner disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isProcessing || !identifier.trim() || event.status !== 'OPEN'}
                className="absolute right-2 sm:right-3 top-2 sm:top-3 h-10 px-4 sm:px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-0 cursor-pointer"
              >
                {isProcessing ? 'Verifying...' : 'Submit'}
              </button>
            </form>
          </div>
        ) : mode === 'CAMERA' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-400" />
                Optical Camera Scanner
              </span>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sensor Ready
              </span>
            </div>

            {/* Live Video Viewport */}
            {cameraError ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border border-amber-800/80 text-neutral-200 text-xs space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-2 flex-1">
                    <div className="font-semibold text-amber-300 text-sm">
                      {cameraError.includes("secure context") || (typeof window !== 'undefined' && window.location.protocol === 'http:')
                        ? "Live Video Stream Requires Secure Context (HTTPS)"
                        : "Camera Initialization Notice"}
                    </div>
                    <p className="text-neutral-300 text-xs leading-relaxed font-sans">
                      {typeof window !== 'undefined' && window.location.protocol === 'http:'
                        ? "Mobile browsers (Safari & Chrome) strictly forbid live video streaming over plain HTTP. Tap the button below to connect via HTTPS on port 3443."
                        : cameraError}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {typeof window !== 'undefined' && window.location.protocol === 'http:' && (
                        <a
                          href={`https://${window.location.hostname}:3443${window.location.pathname}`}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>🚀 Open on HTTPS (Port 3443)</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => setCameraRetryKey((k) => k + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold cursor-pointer border border-neutral-700"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-blue-400 text-xs font-semibold cursor-pointer border border-neutral-700"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Take Photo Instead</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative w-full max-w-lg mx-auto aspect-video rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    webkit-playsinline="true"
                    className="w-full h-full object-cover"
                    onClick={() => {
                      if (videoRef.current && videoRef.current.paused) {
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                  />

                  {/* Lens Switcher & Camera Controls Top Overlay */}
                  <div className="absolute top-2.5 inset-x-3 flex items-center justify-between pointer-events-auto z-10">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-neutral-700/60 text-[10px] font-mono text-emerald-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span>{isCameraActive ? 'LIVE SENSOR' : 'INITIALIZING'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white text-[11px] font-medium border border-neutral-700 shadow-md backdrop-blur-md transition cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-blue-400" />
                      <span>Switch Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
                    </button>
                  </div>

                  {/* Target Bounding Frame & Laser Scanning Beam */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3 sm:p-4">
                    <div className="relative w-[92%] h-[60%] border-2 border-emerald-400/70 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.25)] flex flex-col justify-between overflow-hidden">
                      {/* Corner Accents */}
                      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />

                      {/* Sweeping Red Laser Beam */}
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.95)] animate-pulse" />

                      <div className="p-1.5 text-center">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-black/70 px-2 py-0.5 rounded-full">
                          Target Barcode Band
                        </span>
                      </div>

                      <div className="p-1.5 text-center">
                        <span className="text-[10px] font-mono text-neutral-200 bg-black/85 px-2.5 py-0.5 rounded-full border border-neutral-700/50">
                          {detectedLaserStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instant Manual Fallback Input right below Viewfinder */}
                <form onSubmit={onFormSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Or enter Student ID / Enrollment / Barcode..."
                    className="flex-1 h-10 px-3.5 rounded-xl border border-neutral-800 bg-neutral-950 text-xs font-mono text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !identifier.trim()}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    Mark
                  </button>
                </form>
              </div>
            )}

            {/* Direct Instant Mobile Camera Snap Action (Alternative / Fallback) */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-neutral-800/80 text-xs">
              <span className="text-neutral-400 text-[11px]">
                Camera focusing issue or low lighting?
              </span>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold cursor-pointer text-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Snap high-res photo instead</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-400" />
                Snap or Upload Barcode
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessing}
                className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-blue-500/50 bg-blue-950/20 hover:bg-blue-900/30 text-white font-semibold text-xs transition cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/40">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-bold mt-1">Take Photo with Camera</span>
                <span className="text-[11px] text-neutral-400">Uses mobile rear camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950/40 hover:bg-neutral-800/40 text-white font-semibold text-xs transition cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-neutral-300" />
                </div>
                <span className="text-sm font-bold mt-1">Choose from Gallery / Files</span>
                <span className="text-[11px] text-neutral-400">Upload screenshot or image</span>
              </button>
            </div>
          </div>
        )}

        {/* Processing Spinner */}
        {isProcessing && (
          <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-800 text-blue-200 text-xs flex items-center justify-center gap-2 font-medium">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            <span>Processing scan and recording attendance...</span>
          </div>
        )}

        {/* Dynamic Scan Result Card (Semantic Green / Amber / Red) */}
        {scanResult && !isProcessing && (
          <div
            className={`rounded-xl border p-4 sm:p-5 transition-all duration-200 ${
              scanResult.status === 'SUCCESS'
                ? 'bg-emerald-950/40 border-emerald-600/80 text-emerald-100 shadow-lg shadow-emerald-950/40'
                : scanResult.status === 'DUPLICATE'
                ? 'bg-amber-950/40 border-amber-600/80 text-amber-100 shadow-lg shadow-amber-950/40'
                : 'bg-red-950/40 border-red-600/80 text-red-100 shadow-lg shadow-red-950/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {scanResult.status === 'SUCCESS' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : scanResult.status === 'DUPLICATE' ? (
                  <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-base sm:text-lg font-bold tracking-tight">
                    {scanResult.status === 'SUCCESS'
                      ? 'Attendance Recorded!'
                      : scanResult.status === 'DUPLICATE'
                      ? 'Duplicate Scan Detected'
                      : 'Scan Rejected'}
                  </div>
                  <div className="text-xs sm:text-sm mt-0.5 opacity-90">{scanResult.message}</div>
                </div>
              </div>

              {scanResult.attendance_status && (
                <div
                  className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider uppercase shrink-0 ${
                    scanResult.attendance_status === 'PRESENT'
                      ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                      : 'bg-amber-900/80 text-amber-200 border border-amber-700'
                  }`}
                >
                  {scanResult.attendance_status}
                </div>
              )}
            </div>

            {scanResult.student && (
              <div className="mt-3.5 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase opacity-70 block">Student Name</span>
                  <span className="font-semibold">{scanResult.student.name}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase opacity-70 block">Enrollment No</span>
                  <span className="font-mono font-semibold">{scanResult.student.enrollment_no}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase opacity-70 block">Department</span>
                  <span>{scanResult.student.department}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase opacity-70 block">Year</span>
                  <span>{scanResult.student.year}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Scans Session Log (Mobile Scrollable) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Recent Scans This Session
          </h3>
          <span className="text-[11px] text-neutral-500 font-mono">{recentLogs.length} logged</span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            No scans recorded in this browser session yet.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-left text-xs min-w-[550px]">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] uppercase text-neutral-500 font-semibold">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Enrollment</th>
                  <th className="pb-2">Department</th>
                  <th className="pb-2">Scanned ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-800/30 transition">
                    <td className="py-2.5 text-neutral-400">{log.markedAt}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : log.status === 'DUPLICATE'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : 'bg-red-950 text-red-400 border border-red-800/60'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-sans font-medium text-white">{log.studentName || '—'}</td>
                    <td className="py-2.5 text-neutral-300">{log.enrollmentNo || '—'}</td>
                    <td className="py-2.5 font-sans text-neutral-400">{log.department || '—'}</td>
                    <td className="py-2.5 text-neutral-500 truncate max-w-[120px]">{log.rawIdentifier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
