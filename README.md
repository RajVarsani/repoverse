# **repo-sync**

`repo-sync` is an NPM package designed for microservices where some part of the code needs to be synchronized across multiple repositories. `repo-sync` can be used both as part of an automated CI/CD pipeline with GitHub Actions or programmatically in Node.js scripts for more contolled and custom synchronization triggers. It proporgates the commits in any of the repositories to all the repos in the config.

## **Installation**

To install `repo-sync`, run the following command:

```bash
npm install repo-sync
```

## **Usage**

`repo-sync` can be used in two different ways:

### **1. As a GitHub Action**

For automatic synchronization upon specific GitHub events, use `repo-sync` in your GitHub Actions workflow.

In your repository, create a GitHub Actions workflow file at `.github/workflows/sync.yml`:

```yaml
name: Repository Sync

on:
  push:
    branches:
      - dev
    paths:
      - 'path/to/sync/**'

jobs:
  sync-repositories:
    name: Sync Repositories with repo-sync
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '14' # Set this to the node version you need

      - name: Install repo-sync
        run: npm install repo-sync

      - name: Execute repo-sync
        env: # Define environment variables
          REPO_SYNC_CONFIG: ${{ secrets.REPO_SYNC_CONFIG }} # JSON config as a secret
          COMMITS: ${{ toJson(github.event.commits) }} # Serialize commit data
          REPOSITORY: ${{ github.repository }} # Repository name ('owner/repo')
        run: |
          echo "Executing repo-sync with repositories..."
          node -e "
            const RepoSyncService = require('repo-sync');     // Import your package
            const config = JSON.parse(process.env.REPO_SYNC_CONFIG);
            const service = new RepoSyncService(config);      // Instantiate service
            const commits = JSON.parse(process.env.COMMITS);  // Parse commit data
            const repository = process.env.REPOSITORY;        // Get repository name

            // Execute sync with deserialized data
            service.execute(repository, commits)
              .then(() => console.log('Synchronized successfully'))
              .catch(error => console.error('Synchronization failed:', error));
          "
```

Ensure the `RE` secrets are set in your repository's settings. These should hold your configuration JSON and GitHub access token, respectively.

### **2. Programmatically in Your Code**

For cases where you need more control over synchronization, such as doing it on-demand or triggering from a cron server, you can invoke the `repo-sync` API directly:

```javascript
const RepoSyncService = require('repo-sync');

// Construct a configuration object for your repositories and settings
const config = {
  repositories: [
    {
      owner: 'example-user',
      repo: 'repo-to-sync-1',
      path: 'models/',
      branch: 'dev',
    },
    {
      owner: 'example-user',
      repo: 'repo-to-sync-2',
      path: 'models/',
      branch: 'dev',
    },
  ],
  syncBranchPrefix: 'sync-branch',
  accessToken: 'ghp_YourGitHubPersonalAccessTokenHere',
};

// Create an instance of the service
const service = new RepoSyncService(config);

// Example repository information and commits
// Source repo shoule be in the config repositories list
const sourceRepo = 'example-user/repo-to-sync-1';
const commits = [
  {
    author: {
      email: 'author@example.com',
      name: 'Author Name',
      username: 'authorusername',
    },
    committer: {
      email: 'committer@example.com',
      name: 'Committer Name',
      username: 'committerusername',
    },
    distinct: true,
    id: 'def1234567890abcdef1234567890abcdef',
    message: 'Update models',
    timestamp: '2023-04-14T13:34:56Z',
    tree_id: 'def123456abc7890def123456abc7890def12345',
    url: 'https://github.com/example-user/repo-to-sync-1/commit/def1234567890abcdef1234567890abcdef',
  },
  // ...Commits data
];

// Execute synchronization action
service
  .execute(sourceRepo, commits)
  .then(() => console.log('Synchronization successful'))
  .catch(error => console.error('Synchronization failed', error));
```

## **Contributing**

We welcome contributions that make this tool more helpful! Please submit issues or pull requests with your proposed changes or enhancements.
