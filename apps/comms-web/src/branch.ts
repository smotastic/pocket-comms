/** How long the description of a suggested branch may be, after its type. */
export const MAX_SUGGESTED_DESCRIPTION = 40;

/**
 * A branch name for a task (spec 005, requirement 6): `fix/` and the title without its first word
 * when that word is "fix" or "bug", else `feat/` and the whole title; the words in lower-case
 * ASCII kebab case, cut at a word. It only prefills the field; the server's rule decides.
 */
export const suggestBranch = (task: string): string => {
  const title = task.trim().split('\n', 1)[0] ?? '';
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
  const fix = words[0] === 'fix' || words[0] === 'bug';
  const rest = fix ? words.slice(1) : words;
  let description = '';
  for (const word of rest) {
    const longer = description === '' ? word : `${description}-${word}`;
    if (longer.length > MAX_SUGGESTED_DESCRIPTION) break;
    description = longer;
  }
  if (description === '' && rest[0] !== undefined) {
    description = rest[0].slice(0, MAX_SUGGESTED_DESCRIPTION);
  }
  return `${fix ? 'fix' : 'feat'}/${description}`;
};
