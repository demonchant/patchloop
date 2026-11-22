import { runProcess } from './process.mjs';
import { parseGitHubRepositoryUrl } from './github-repository.mjs';

export async function discoverGitHubRepositories() {
  const auth = await runProcess('gh', ['auth', 'status'], { timeoutMs: 12_000, maxBytes: 20_000 });
  if (auth.code !== 0) return { connected: false, targets: [] };

  const result = await runProcess('gh', ['api', 'user/repos', '--paginate', '--slurp', '-f', 'affiliation=owner,collaborator,organization_member', '-f', 'per_page=100', '--jq', 'add | .[:100] | map({nameWithOwner: .full_name, url: .html_url, isPrivate: .private})'], { timeoutMs: 30_000, maxBytes: 500_000, outputLimit: 500_000 });
  if (result.code !== 0) return { connected: true, targets: [] };

  try {
    const repos = JSON.parse(result.stdout);
    const targets = [];
    for (const repo of repos) {
      try {
        const repository = parseGitHubRepositoryUrl(repo.url);
        targets.push({
          id: repository.id,
          name: repository.name,
          kind: 'github',
          ready: true,
          url: repository.cloneUrl,
          isPrivate: Boolean(repo.isPrivate),
          requirements: `${repo.isPrivate ? 'Private' : 'Public'} GitHub repository. Clone and branch push use this computer's GitHub access.`,
        });
      } catch {}
    }
    return { connected: true, targets };
  } catch {
    return { connected: true, targets: [] };
  }
}
