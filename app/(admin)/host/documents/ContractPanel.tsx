"use client";

/**
 * The hosting contract's only document-step-local field: whether to
 * pre-sign the Theta Xi side. Moved off /host/contract, which is now a pure
 * form. Local state, always defaults to false on each visit (never persisted).
 */
export default function ContractPanel({
  sign,
  onSignChange,
}: {
  sign: boolean;
  onSignChange: (value: boolean) => void;
}) {
  return (
    <div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={sign}
          onChange={e => onSignChange(e.target.checked)}
        />
        <span className="text-[14px]">Auto-sign Theta Xi side with today&rsquo;s date</span>
      </label>
    </div>
  );
}
