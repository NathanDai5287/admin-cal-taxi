"use client";

import { resetVotesAction } from "./actions";
import { Button } from "@/components/brand/button";

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
      <Button
        type="submit"
        variant="danger"
        compact
      >
        Reset votes
      </Button>
    </form>
  );
}
