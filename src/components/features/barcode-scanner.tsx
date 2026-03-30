"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarcodeScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
}

function isISBN(code: string): boolean {
  // EAN-13 with ISBN prefix (978 or 979)
  if (code.length === 13 && (code.startsWith("978") || code.startsWith("979"))) {
    return true;
  }
  // ISBN-10
  if (code.length === 10 && /^[0-9]{9}[0-9X]$/.test(code)) {
    return true;
  }
  return false;
}

function isUPC(code: string): boolean {
  // UPC-A is 12 digits, EAN-13 without 978/979 prefix
  if (code.length === 12 && /^\d+$/.test(code)) return true;
  if (code.length === 13 && /^\d+$/.test(code) && !code.startsWith("978") && !code.startsWith("979")) return true;
  return false;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const [error, setError] = useState("");
  const [upcWarning, setUpcWarning] = useState("");
  const [starting, setStarting] = useState(true);
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    try {
      const scanner = html5QrCodeRef.current;
      if (scanner) {
        const state = scanner.getState();
        // Html5QrcodeScannerState.SCANNING = 2
        if (state === 2) {
          await scanner.stop();
        }
        scanner.clear();
        html5QrCodeRef.current = null;
      }
    } catch {
      // Scanner may already be stopped
    }
  }, []);

  const handleClose = useCallback(async () => {
    await stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      if (!scannerRef.current) return;

      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted) return;

        const scannerId = "barcode-scanner-viewport";

        // Ensure the container element exists
        const container = scannerRef.current;
        if (!container.querySelector(`#${scannerId}`)) {
          const div = document.createElement("div");
          div.id = scannerId;
          container.appendChild(div);
        }

        const html5QrCode = new Html5Qrcode(scannerId);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 100 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (hasScannedRef.current) return;

            const cleaned = decodedText.replace(/[^0-9X]/gi, "").toUpperCase();

            if (isISBN(cleaned)) {
              hasScannedRef.current = true;
              onScan(cleaned);
            } else if (isUPC(cleaned)) {
              setUpcWarning(
                "This looks like a UPC, not an ISBN. Try the other barcode or enter ISBN manually."
              );
              // Don't set hasScannedRef -- let them keep scanning
            }
          },
          () => {
            // QR code scan failure -- expected, ignore
          },
        );

        if (mounted) setStarting(false);
      } catch (err) {
        if (mounted) {
          setStarting(false);
          if (err instanceof Error) {
            if (err.message.includes("NotAllowedError") || err.message.includes("Permission")) {
              setError("Camera access denied. Please allow camera access and try again.");
            } else if (err.message.includes("NotFoundError")) {
              setError("No camera found. Make sure your device has a camera.");
            } else {
              setError(`Camera error: ${err.message}`);
            }
          } else {
            setError("Failed to start camera.");
          }
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  return (
    <div className="space-y-4">
      {/* Scanner viewport */}
      <div
        ref={scannerRef}
        className="relative overflow-hidden rounded-xl border border-white/10 bg-black"
        style={{ minHeight: "280px" }}
      >
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Camera className="h-8 w-8 animate-pulse" />
              <p className="text-sm">Starting camera...</p>
            </div>
          </div>
        )}
      </div>

      {/* Scan guide text */}
      {!error && !starting && (
        <p className="text-center text-sm text-text-muted">
          Point at the ISBN barcode on the back cover
        </p>
      )}

      {/* UPC warning */}
      {upcWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{upcWarning}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Close button */}
      <Button variant="secondary" className="w-full" onClick={handleClose}>
        <X className="mr-1 h-4 w-4" />
        Cancel Scan
      </Button>
    </div>
  );
}
