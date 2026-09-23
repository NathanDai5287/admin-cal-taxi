import { Button } from "@/components/brand/button";

/** Label + input + hint atom, matching the one used on the contract/invoice pages. */
export default function Field({
  label,
  hint,
  onResetAuto,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * When set, the field is pinned to a manually typed value and no longer
   * follows its upstream source — renders an affordance to un-pin it.
   */
  onResetAuto?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
      {onResetAuto && (
        <p className="field-hint">
          Set manually — won&rsquo;t follow upstream changes.{" "}
          <Button type="button" variant="text" onClick={onResetAuto}>
            Reset to auto
          </Button>
        </p>
      )}
    </div>
  );
}
