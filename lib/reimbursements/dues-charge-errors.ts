type SupabaseError = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

type DuesChargeFailure = {
  error: SupabaseError | null;
  selectedMemberIds: string[];
  loadedMemberIds?: string[];
};

function databaseError(error: SupabaseError | null) {
  return {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

export function reportDuesProfilePreflightFailure({
  error,
  selectedMemberIds,
  loadedMemberIds = [],
}: DuesChargeFailure) {
  console.error("Dues charge save failed", {
    stage: "profile_preflight",
    databaseError: databaseError(error),
    selectedMemberIds,
    selectedMemberCount: selectedMemberIds.length,
    loadedMemberIds,
    loadedMemberCount: loadedMemberIds.length,
  });
  return "member-selection-changed" as const;
}

export function reportDuesInsertFailure({
  error,
  selectedMemberIds,
}: DuesChargeFailure) {
  console.error("Dues charge save failed", {
    stage: "receivables_insert",
    databaseError: databaseError(error),
    selectedMemberIds,
    selectedMemberCount: selectedMemberIds.length,
  });
  return "charge-insert-failed" as const;
}
