import { Button } from "@/components/brand/button";

export function TemplateUploadFields({ checklistReportKey }: { checklistReportKey?: string }) {
  return (
    <>
      {checklistReportKey ? <input type="hidden" name="checklistReportKey" value={checklistReportKey} /> : (
        <label className="field-label">Template name<input className="field-input" name="templateName" placeholder="Big Brother Contract" required /></label>
      )}
      <label className="field-label">Blank PDF, DOCX, or XLSX<input className="file-input mt-1" type="file" name="file" accept=".pdf,.docx,.xlsx" required /></label>
      <details className="border-t border-rule pt-3">
        <summary className="cursor-pointer text-sm font-bold text-brand">Optional guidance</summary>
        <div className="mt-3 form-stack">
          <label className="field-label">What should the assistant know?<textarea className="field-textarea min-h-24" name="guidance" placeholder="Terminology, ordinary defaults, or how this form is used." /></label>
          <label className="field-label">Completed example<input className="file-input mt-1" type="file" name="example" accept=".pdf,.docx,.xlsx" /><span className="field-hint">Use the same file format as the blank template.</span></label>
        </div>
      </details>
      <Button type="submit">Save template</Button>
    </>
  );
}
