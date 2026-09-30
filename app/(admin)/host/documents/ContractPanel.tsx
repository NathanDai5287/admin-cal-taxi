"use client";

/**
 * The hosting contract's only document-step-local field: whether to
 * pre-sign the Theta Xi side. Moved off /host/contract, which is now a pure
 * form. Local state, always defaults to false on each visit (never persisted).
 */
export default function ContractPanel({
  sign,
  onSignChange,
  readOnly = false,
}: {
  sign: boolean;
  onSignChange: (value: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={sign}
          disabled={readOnly}
          onChange={e => onSignChange(e.target.checked)}
        />
        <span className="text-[14px]">{readOnly ? (sign ? "Theta Xi side was auto-signed" : "Theta Xi side was not auto-signed") : <>Auto-sign Theta Xi side with today&rsquo;s date</>}</span>
      </label>
    </div>
  );
}
