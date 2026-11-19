export function classifyRun(attempts, verdict, objectiveHash, repairCount) {
  const kane = attempts.filter((attempt) => attempt.kind === 'kane');
  const lastTwo = kane.slice(-2);
  const repeatedFailure = lastTwo.length === 2 && lastTwo.every((attempt) => attempt.verdict === 'failed' && attempt.objectiveHash === objectiveHash);
  const conflict = verdict === 'passed' && lastTwo.length > 0 && lastTwo.at(-1).verdict === 'failed' && lastTwo.at(-1).objectiveHash === objectiveHash && repairCount === 0;
  return { repeatedFailure, conflict };
}
