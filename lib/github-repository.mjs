import { createHash } from 'node:crypto';

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

export function parseGitHubRepositoryUrl(value) {
  if (typeof value !== 'string' || value.length > 300 || value.trim() !== value) {
    throw new Error('Enter an HTTPS GitHub repository link.');
  }

  let url;
  try { url = new URL(value); }
  catch { throw new Error('Enter an HTTPS GitHub repository link.'); }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a GitHub.com repository link over HTTPS, without credentials, query strings, or fragments.');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) throw new Error('Paste the repository root link, such as https://github.com/owner/repository.');
  const [owner, rawRepository] = parts;
  const repository = rawRepository.replace(/\.git$/i, '');
  if (!SEGMENT.test(owner) || !SEGMENT.test(repository) || owner === '.' || owner === '..' || repository === '.' || repository === '..') {
    throw new Error('That GitHub repository link is not valid.');
  }

  const cloneUrl = `https://github.com/${owner}/${repository}.git`;
  const id = `github-${createHash('sha256').update(cloneUrl.toLowerCase()).digest('hex').slice(0, 24)}`;
  return { id, name: `${owner}/${repository}`, cloneUrl };
}
