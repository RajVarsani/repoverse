import { Octokit } from '@octokit/rest';
import { GitHubCommitInfo } from './types/github';
import { BlobData, CommitData } from './types/octokit';

interface RepositoryConfig {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  reviewers: string[];
}

export interface RepoverseConfig {
  repositories: RepositoryConfig[];
  syncBranchPrefix: string;
  accessToken: string;
}

interface CommitDataCache {
  [key: string]: CommitData & {
    blobCache: {
      [key: string]: BlobData;
    };
  };
}

class Repoverse {
  private config: RepoverseConfig;
  private octokit: Octokit;

  constructor(config: RepoverseConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: this.config.accessToken,
    });
  }

  /**
   * Process the action of syncing the commits from one repository to rest of the repositories
   */
  public async synchronize(
    sourceRepository: string,
    commits: GitHubCommitInfo[]
  ): Promise<void> {
    try {
      this.validateSourceRepository(sourceRepository);

      const [sourceOwner, sourceRepo] = sourceRepository.split('/');
      const sourceRepoConfig = this.getSourceRepositoryConfig(
        sourceOwner,
        sourceRepo
      );
      const distinctCommits = this.filterDistinctCommits(commits);
      const syncBranchName = this.createSyncBranchName();

      const commitDataCache = await this.cacheCommitData(
        distinctCommits,
        sourceOwner,
        sourceRepo,
        sourceRepoConfig.path
      );

      await Promise.all(
        this.config.repositories.map(async targetRepoConfig => {
          await this.syncCommitsAcrossRepositories(
            distinctCommits,
            commitDataCache,
            sourceRepoConfig,
            targetRepoConfig,
            syncBranchName
          );
        })
      );
    } catch (error) {
      console.error(error, '[SYNC MODELS ACROSS REPOSITORIES]');
      throw error;
    }
  }

  public getConfig(): typeof Repoverse.prototype.config {
    return this.config;
  }

  private validateSourceRepository(sourceRepository: string): void {
    if (!sourceRepository.includes('/')) {
      throw new Error(
        "The source repository must be in the format 'owner/repo'"
      );
    }
  }

  private getSourceRepositoryConfig(
    sourceOwner: string,
    sourceRepo: string
  ): RepositoryConfig {
    const repoConfig = this.config.repositories.find(
      repoConfig =>
        repoConfig.owner === sourceOwner && repoConfig.repo === sourceRepo
    );
    if (!repoConfig) {
      throw new Error(
        `Source repository ${sourceOwner}/${sourceRepo} is not in the list of repositories to sync`
      );
    }
    return repoConfig;
  }

  private filterDistinctCommits(
    commits: GitHubCommitInfo[]
  ): GitHubCommitInfo[] {
    return commits
      .filter(commit => commit.distinct)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }

  private createSyncBranchName(): string {
    return `${this.config.syncBranchPrefix}-${Date.now()}`;
  }

  private async cacheCommitData(
    distinctCommits: GitHubCommitInfo[],
    sourceOwner: string,
    sourceRepo: string,
    sourceDirPath: string
  ): Promise<CommitDataCache> {
    const commitDataCache: {
      [key in (typeof distinctCommits)[0]['id']]: CommitData & {
        blobCache: {
          [key: string]: BlobData;
        };
      };
    } = {};
    await Promise.all(
      distinctCommits.map(async commit => {
        const commitData = await this.octokit.repos.getCommit({
          owner: sourceOwner,
          repo: sourceRepo,
          ref: commit.id,
        });
        if (!commitData.data.files) {
          return;
        }
        commitData.data.files = commitData.data.files.filter(file =>
          file.filename.startsWith(sourceDirPath)
        );
        const blobCache: {
          [key in (typeof commitData.data.files)[0]['sha']]: BlobData;
        } = {};
        await Promise.all(
          commitData.data.files
            .filter(file => file.status !== 'removed')
            .map(async file => {
              blobCache[file.sha] = await this.octokit.git.getBlob({
                owner: sourceOwner,
                repo: sourceRepo,
                file_sha: file.sha,
              });
            })
        );
        // commitData.blobCache = blobCache;
        commitDataCache[commit.id] = { ...commitData, blobCache };
      })
    );

    return commitDataCache;
  }

  private async syncCommitsAcrossRepositories(
    distinctCommits: GitHubCommitInfo[],
    commitDataCache: CommitDataCache,
    sourceRepoConfig: RepositoryConfig,
    targetRepoConfig: RepositoryConfig,
    syncBranchName: string
  ): Promise<void> {
    const {
      owner,
      repo,
      path: targetPath,
      branch,
      reviewers,
    } = targetRepoConfig;
    if (sourceRepoConfig.owner === owner && sourceRepoConfig.repo === repo) {
      return;
    }

    // Get the latest commit SHA from the target repository
    const targetLatestCommitSha = await this.fetchLatestCommitSha(
      owner,
      repo,
      branch
    );

    // Create a new branch from the latest commit in the target repository
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${syncBranchName}`,
      sha: targetLatestCommitSha,
    });

    // Cannot process these commits concurrently since they may affect the same file
    // hence need to process them sequentially
    for (const commit of distinctCommits) {
      const commitData = commitDataCache[commit.id];
      const affectedFiles = commitData.data.files;
      if (!affectedFiles?.length) {
        continue;
      }

      await Promise.all(
        affectedFiles.map(async file => {
          const targetFilePath = `${targetPath}${file.filename.slice(
            sourceRepoConfig.path.length
          )}`;

          let blobData = null;
          if (file.status !== 'removed') {
            blobData = commitData.blobCache[file.sha];
          }

          let targetFileSha = null;
          if (file.status !== 'added') {
            targetFileSha = await this.fetchFileSha(
              owner,
              repo,
              syncBranchName,
              targetFilePath
            );
          }

          // In case of GitHub the below four cases are possible
          // 1. added
          // 2. modified
          // 3. renamed
          // 4. deleted
          // There are other cases "copied", "changed", and "unchanged"
          // since they're not standard GitHub commit statuses we are not considering them
          // we may need to consider them in future if GitHub supports them
          // or if we switch to a different git provider
          switch (file.status) {
            case 'added':
            case 'modified': {
              // Create or update the file in the target repository
              if (blobData)
                await this.syncFileWithRepository(
                  owner,
                  repo,
                  targetFilePath,
                  blobData.data.content,
                  undefined,
                  syncBranchName
                );
              break;
            }
            case 'removed': {
              // Delete the file from the target repository
              if (targetFileSha) {
                await this.deleteFile(
                  owner,
                  repo,
                  targetFilePath,
                  file.sha,
                  syncBranchName
                );
              }
              break;
            }
            case 'renamed': {
              // Handle renamed files by deleting the old file path and creating a new file at the new path
              if (file.previous_filename) {
                const prevFilePath = `${targetPath}${file.previous_filename.slice(
                  sourceRepoConfig.path.length
                )}`;

                // If previously file existed, delete it
                const prevFileSha = await this.fetchFileSha(
                  owner,
                  repo,
                  syncBranchName,
                  prevFilePath
                );
                if (prevFileSha) {
                  await this.deleteFile(
                    owner,
                    repo,
                    prevFilePath,
                    prevFileSha,
                    syncBranchName
                  );
                }
              }

              // Create a new file at the renamed path
              if (blobData)
                await this.syncFileWithRepository(
                  owner,
                  repo,
                  targetFilePath,
                  blobData.data.content,
                  undefined, // sha is null since we are effectively adding a new file
                  syncBranchName
                );
              break;
            }
          }
        })
      );
    }

    // Create a pull request
    const title = `Sync models directory with ${sourceRepoConfig.owner}/${sourceRepoConfig.repo}`;
    // Build a detailed PR body with commit messages and authors
    const body = this.buildPRBody(
      sourceRepoConfig.owner,
      sourceRepoConfig.repo,
      distinctCommits
    );
    const raisedPR = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      head: syncBranchName,
      base: branch,
      body,
    });

    // Request review
    await this.octokit.pulls.requestReviewers({
      owner: owner,
      repo: repo,
      pull_number: raisedPR.data.number,
      reviewers: reviewers,
    });

    console.log(
      `CREATED PULL REQUEST ${raisedPR.data.html_url} IN ${owner}/${repo}`
    );
  }

  // Building the PR body with commits and authors
  private buildPRBody(
    sourceRepoOwner: string,
    sourceRepoName: string,
    commits: {
      author: {
        email: string;
        name: string;
        username: string;
      };
      committer: {
        email: string;
        name: string;
        username: string;
      };
      distinct: boolean;
      id: string;
      message: string;
      timestamp: string;
      tree_id: string;
      url: string;
    }[]
  ): string {
    const commitMessages = commits
      .map(
        commit =>
          `- ${commit.message} ([#${commit.id.substring(0, 7)}](${commit.url}))`
      )
      .join('\n');

    const authorsSet = new Set();
    commits.forEach(commit => {
      const { author, committer } = commit;

      const authorInfo = `${author.name} ([@${author.username}](https://github.com/${author.username})) <${author.email}>`;
      authorsSet.add(authorInfo); // Add author to set for uniqueness

      // ignore the commiter if it is github @web-flow
      // which is the default author in case of PR merge
      // https://github.com/web-flow
      if (
        author.username !== committer.username &&
        committer.username !== 'web-flow'
      ) {
        const committerInfo = `${committer.name} ([@${committer.username}](https://github.com/${committer.username})) <${committer.email}>`;
        authorsSet.add(committerInfo); // Add committer to set for uniqueness
      }
    });

    // Convert Set to Array and join for unique author/committer listing
    const authorsList = Array.from(authorsSet).join('\n');

    return [
      '## Synchronization of the models directory',
      `This PR is auto-generated to sync the models directory with changes made in \`${sourceRepoOwner}/${sourceRepoName}\`.`,
      '',
      '## Commits:',
      commitMessages,
      '',
      '## Authors:',
      authorsList,
    ].join('\n');
  }

  // helper functions for abstracting away the GitHub API
  private async fetchLatestCommitSha(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> {
    const { data: refData } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return refData.object.sha;
  }

  private async fetchFileSha(
    targetOwner: string,
    targetRepo: string,
    targetBranch: string,
    targetFilePath: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: targetOwner,
        repo: targetRepo,
        path: targetFilePath,
        ref: targetBranch,
      });
      if (Array.isArray(data)) {
        // Handle the case when data is an array
        return data[0].sha;
      } else {
        // Handle the case when data is an object
        return data.sha;
      }
    } catch (error: any) {
      if ((error as { status: number }).status === 404) {
        // File not found, return null for the SHA (file will be created)
        return null;
      } else {
        throw error;
      }
    }
  }

  private async syncFileWithRepository(
    owner: string,
    repo: string,
    path: string,
    content: string,
    sha: string | undefined,
    branch: string
  ): Promise<void> {
    const operation = sha ? 'Update' : 'Create';

    await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `[Sync] ${operation} ${path}`,
      content,
      sha, // If the file exists, this is the blob SHA to update; otherwise, null creates the file.
      branch,
    });
  }

  private async deleteFile(
    owner: string,
    repo: string,
    path: string,
    sha: string,
    branch: string
  ): Promise<void> {
    await this.octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message: `[Sync] Delete ${path}`,
      sha, // SHA of the file to delete
      branch,
    });
  }
}

export default Repoverse;
