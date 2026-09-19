export default function VenueInquiriesLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading venue inquiries">
      <div className="h-20 animate-pulse bg-canvas" />
      <div className="space-y-px border-t-[3px] border-brand">
        <div className="h-20 animate-pulse bg-canvas" />
        <div className="h-20 animate-pulse bg-canvas" />
        <div className="h-20 animate-pulse bg-canvas" />
      </div>
    </div>
  );
}
