import type { NuNewsIssue } from "./issue";

// One photo box in the built PDF, in points, as the template reports it.
export type PhotoPlacement = { src: string; width: number; height: number; aspect: number };
export type CropWarning = { src: string; text: string };

const WARNING_PERCENT = 30;

export function croppedShare({ width, height, aspect }: PhotoPlacement) {
  const boxAspect = width / height;
  return boxAspect > aspect
    ? { dimension: "height", share: 1 - aspect / boxAspect }
    : { dimension: "width", share: 1 - boxAspect / aspect };
}

// Only single-photo boxes can lose more than 30%: the template limits photo rows to 20%.
function photoName(issue: NuNewsIssue, src: string) {
  if (issue.cover?.src === src) return "The title photo";
  const index = issue.articles.findIndex((article) => article.headshot?.src === src);
  if (index < 0) return "The donate page photo";
  return `${issue.articles[index].author.trim() || `Article ${index + 1}`}’s headshot`;
}

export function cropWarnings(issue: NuNewsIssue, placements: PhotoPlacement[]): CropWarning[] {
  return placements.flatMap((placement) => {
    const { dimension, share } = croppedShare(placement);
    const percent = Math.round(share * 100);
    if (percent <= WARNING_PERCENT) return [];
    const remedy = dimension === "height" ? "wider" : "taller";
    const text = `${photoName(issue, placement.src)} loses ${percent}% of its ${dimension}. Set its focus point or use a ${remedy} photo.`;
    return [{ src: placement.src, text }];
  });
}
