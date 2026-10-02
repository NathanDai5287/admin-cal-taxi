"use client";

/**
 * Chapter presigning preference for the hosting contract. The documents
 * page stores this with the shared draft so it survives a reload.
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
