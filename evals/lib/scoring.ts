export interface RoutingSample {
  model: string;
  caseId: string;
  expected: boolean;
  loaded: boolean;
  status: "success" | "failure";
}

export function scoreRouting(samples: RoutingSample[]) {
  const confusion = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  let unresolved = 0;
  for (const sample of samples) {
    if (sample.status !== "success") {
      unresolved += 1;
      continue;
    }
    if (sample.expected && sample.loaded) confusion.truePositive += 1;
    else if (sample.expected) confusion.falseNegative += 1;
    else if (sample.loaded) confusion.falsePositive += 1;
    else confusion.trueNegative += 1;
  }
  const predictedPositive = confusion.truePositive + confusion.falsePositive;
  const actualPositive = confusion.truePositive + confusion.falseNegative;
  return {
    confusion,
    precision: predictedPositive === 0 ? null : confusion.truePositive / predictedPositive,
    recall: actualPositive === 0 ? null : confusion.truePositive / actualPositive,
    unresolved,
    complete: unresolved === 0,
  };
}
