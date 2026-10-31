/** How long ago `at` was, as the overview shows it: "now", "12s", "4m", "2h" or "3d". */
export const since = (at: number, now: number): string => {
  const seconds = Math.floor((now - at) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};
