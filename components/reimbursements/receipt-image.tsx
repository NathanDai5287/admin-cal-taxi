"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { ReviewDecisionButtons } from "@/components/reimbursements/review-decision-buttons";
import type { ReimbursementStatus } from "@/components/reimbursements/inline-status-select";

const ZOOM_SCALE = 2.5;

type ReceiptImageProps = {
  alt: string;
  comparisonMessage: string;
  paymentMethod: string;
  processingComplete: boolean;
  reimbursementStatus: ReimbursementStatus;
  src: string;
  submittedTotal: string;
  tabscannerTotal: string;
  totalsMatch: boolean;
};

export function ReceiptImage({
  alt,
  comparisonMessage,
  paymentMethod,
  processingComplete,
  reimbursementStatus,
  src,
  submittedTotal,
  tabscannerTotal,
  totalsMatch,
}: ReceiptImageProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const enlargedImageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const draggedRef = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });

  function resetZoom() {
    dragRef.current = null;
    setIsZoomed(false);
    setIsDragging(false);
    setZoomOffset({ x: 0, y: 0 });
  }

  function closeDialog() {
    resetZoom();
    dialogRef.current?.close();
  }

  function clampZoomOffset(offset: { x: number; y: number }) {
    const image = enlargedImageRef.current;
    const viewport = image?.parentElement;
    if (!image || !viewport) return offset;

    const maxX = Math.max(0, (image.offsetWidth * ZOOM_SCALE - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * ZOOM_SCALE - viewport.clientHeight) / 2);

    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  function toggleZoom(event: MouseEvent<HTMLButtonElement>) {
    if (draggedRef.current) return;

    if (isZoomed) {
      resetZoom();
      return;
    }

    const image = enlargedImageRef.current;
    if (!image) return;

    const viewport = event.currentTarget.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    const keyboardClick = event.detail === 0;

    if (!keyboardClick && (
      event.clientX < imageBounds.left
      || event.clientX > imageBounds.right
      || event.clientY < imageBounds.top
      || event.clientY > imageBounds.bottom
    )) return;

    const clickX = keyboardClick
      ? viewport.width / 2
      : event.clientX - viewport.left;
    const clickY = keyboardClick
      ? viewport.height / 2
      : event.clientY - viewport.top;

    setZoomOffset(clampZoomOffset({
      x: -(clickX - viewport.width / 2) * ZOOM_SCALE,
      y: -(clickY - viewport.height / 2) * ZOOM_SCALE,
    }));
    setIsZoomed(true);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!isZoomed) return;

    event.preventDefault();
    draggedRef.current = false;
    dragRef.current = {
      originX: zoomOffset.x,
      originY: zoomOffset.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function dragImage(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) draggedRef.current = true;

    setZoomOffset(clampZoomOffset({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  return (
    <>
      <button
        aria-label="Enlarge receipt image"
        className="receipt-preview-button"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {/* Receipt URLs are short-lived Supabase URLs and cannot be configured as a stable Next image host. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} className="receipt-preview" src={src} />
        <span>Click to enlarge</span>
      </button>

      <dialog
        aria-label="Enlarged receipt"
        className="receipt-dialog"
        onClose={resetZoom}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        ref={dialogRef}
      >
        <span className="receipt-dialog-hint">
          {isZoomed ? "Drag to move around • click to zoom out" : "Click an area of the image to center and zoom"}
        </span>
        <button
          aria-label="Close enlarged receipt"
          className="receipt-dialog-close"
          onClick={closeDialog}
          type="button"
        >
          ×
        </button>
        <div className="receipt-dialog-layout">
          <div className="receipt-dialog-viewport">
            <button
              aria-label={isZoomed ? "Zoom receipt image out" : "Zoom into the selected receipt area"}
              aria-pressed={isZoomed}
              className={`receipt-dialog-zoom${isZoomed ? " is-zoomed" : ""}${isDragging ? " is-dragging" : ""}`}
              onClick={toggleZoom}
              onPointerCancel={endDrag}
              onPointerDown={startDrag}
              onPointerMove={dragImage}
              onPointerUp={endDrag}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={alt}
                className="receipt-dialog-image"
                ref={enlargedImageRef}
                src={src}
                draggable={false}
                style={{
                  transform: isZoomed
                    ? `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${ZOOM_SCALE})`
                    : undefined,
                }}
              />
            </button>
          </div>

          <section aria-labelledby="dialog-total-comparison" className="receipt-dialog-totals">
            <div className="receipt-dialog-totals-heading">
              <div>
                <span>Amount check</span>
                <h2 id="dialog-total-comparison">Total comparison</h2>
              </div>
              <span className={`badge ${totalsMatch ? "badge-approved" : "badge-pending"}`}>
                {totalsMatch ? "Match" : "Review"}
              </span>
            </div>
            <dl className="receipt-dialog-total-values">
              <div><dt>Submitted total</dt><dd>{submittedTotal}</dd></div>
              <div><dt>Tabscanner total</dt><dd>{tabscannerTotal}</dd></div>
            </dl>
            <p className={totalsMatch ? "verification-match" : "verification-review"}>
              {comparisonMessage}
            </p>
            <div className="receipt-dialog-payment">
              <span>Zelle phone number or email</span>
              <strong>{paymentMethod}</strong>
            </div>
            <div className="receipt-dialog-actions">
              <ReviewDecisionButtons
                compact
                disabled={!processingComplete}
              />
              {!processingComplete && reimbursementStatus === "pending" && (
                <p>Actions are available when automatic processing finishes.</p>
              )}
            </div>
          </section>
        </div>
      </dialog>
    </>
  );
}
