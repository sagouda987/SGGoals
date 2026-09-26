export type ConnectionRecord = {
  heartbeatAt?: string;
  lastSuccessfulReviewAt?: string;
  lastReviewErrorAt?: string;
  lastError?: string;
};

export function connectionStatus(record: ConnectionRecord, now = Date.now()) {
  const age = now - Date.parse(record.heartbeatAt ?? '');
  const fresh = Number.isFinite(age) && age >= 0 && age < 90000;
  const failed = Date.parse(record.lastReviewErrorAt ?? '') > Date.parse(record.lastSuccessfulReviewAt ?? '1970-01-01');
  return {
    state: !fresh ? 'Offline' as const : failed ? 'Retrying' as const : 'Connected' as const,
    lastSuccessfulReviewAt: record.lastSuccessfulReviewAt ?? null,
    message: !fresh ? 'No recent connector heartbeat. Keep the host computer awake, signed in, and online.'
      : failed ? record.lastError || 'The last review failed. Try Review again.'
      : 'Connector process is reporting. ChatGPT delivery is verified only when you receive its response.'
  };
}
