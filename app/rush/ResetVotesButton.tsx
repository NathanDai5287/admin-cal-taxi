"use client";

import { resetVotesAction } from "./actions";

export default function ResetVotesButton() {
  return (
    <form
      action={resetVotesAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Reset all pizza vote counts? Current totals will be archived, not deleted.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
      >
        Reset votes
      </button>
    </form>
  );
}
