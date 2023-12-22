# **repoverse**

`repoverse` is a tool for distributed systems and microservices where some part of the code needs to be synchronized across multiple repositories. It propagates commits across all the repositories in the configuration, ensuring up-to-date synchronization.


## **Installation**

To install `repoverse`, run the following command:

```bash
npm install repoverse
```

## **Usage**

`repoverse` can be used in two different ways:

### **1. As a GitHub Action**

Automate changes synchronization based on GitHub push events by using repoverse within your GitHub Actions workflows.
Create a workflow file, for example, .github/workflows/sync.yml in your repository:

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
  repo-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '20'
      - run: npm install repoverse
      - name: Run repoverse synchronization
        env:
          REPOVERSE_CONFIG: ${{ secrets.REPOVERSE_CONFIG }}
          COMMITS: ${{ toJson(github.event.commits) }}
          REPOSITORY: ${{ github.repository }}
        run: |
          echo "Running repoverse synchronization..."
          node -e "
            const Repoverse = require('repoverse');
            const config = JSON.parse(process.env.REPOVERSE_CONFIG);
            const repoverse = new Repoverse(config);
            const commits = JSON.parse(process.env.COMMITS); 
            const repository = process.env.REPOSITORY;

            repoverse.synchronize(repository, commits)
              .then(() => console.log('Repositories synchronized successfully'))
              .catch(error => console.error('Synchronization failed:', error));
          "
```

Make sure that the REPOVERSE_CONFIG secret is created in your repository's settings, containing the synchronization configuration in JSON format.

### **2. Programmatically in Your Code**

For on-demand synchronization or when you require more control over the process, use the repoverse API directly in your Node.js applications:

```javascript
const Repoverse = require('repoverse');

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

const repoverse = new Repoverse(config);

// Source repository should be in the 'owner/repo' format and present in the config's repositories list
const sourceRepo = 'your-organization/source-repo';
const commits = [
  // Your array of commit objects to synchronize
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
];

repoverse.synchronize(sourceRepo, commits)
  .then(() => console.log('Synchronization successful'))
  .catch(error => console.error('Synchronization failed:', error));
```

## **Contributing**

Contributions to `repoverse` are highly encouraged! If you have a suggestion, fix, or enhancement, please open an issue or a pull request. Help us make repository synchronization seamless for developers.

Ensure the phrases and variables are updated to align with your package's API. The usage instructions provided should precisely match how your package is intended to be used.

