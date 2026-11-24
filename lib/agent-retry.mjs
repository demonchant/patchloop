export function canRetryCodexArgumentFailure(attempts) {
  const agentAttempts = attempts.filter((attempt) => attempt.kind === 'agent');
  const latest = agentAttempts.at(-1);
  const matchingFailures = agentAttempts.filter((attempt) => attempt.providerId === 'codex'
    && attempt.exitCode === 2 && /unexpected argument/i.test(attempt.outputTail ?? ''));
  return latest?.providerId === 'codex' && latest.exitCode === 2
    && /unexpected argument/i.test(latest.outputTail ?? '') && matchingFailures.length > 0 && matchingFailures.length <= 2;
}
