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
      <p className="text-[12.5px] text-muted mb-3 max-w-2xl leading-relaxed">
        When enabled, the contract is generated with the Theta Xi Executive Board signature
        and today&rsquo;s date already filled in. The renter&rsquo;s side is left blank.
      </p>
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
