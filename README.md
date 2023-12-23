# **Repoverse** ![version](https://img.shields.io/badge/version-1.0.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

`Repoverse` is a powerful tool designed for distributed systems and microservices. It automates the propagation of relevant commits across multiple repositories, ensuring consistency and saving you time.

## 📖 Table of Contents

- [**Repoverse** ](#repoverse--)
  - [📖 Table of Contents](#-table-of-contents)
  - [🌐 Overview](#-overview)
  - [⭐ Key Features](#-key-features)
  - [📚 Prerequisites](#-prerequisites)
  - [⚙️ Configuration](#️-configuration)
  - [📦 Installation](#-installation)
  - [🚀 Usage](#-usage)
    - [As a GitHub Action](#as-a-github-action)
    - [Programmatically in Your Code](#programmatically-in-your-code)
  - [🔄 Workflow](#-workflow)
  - [🤝 Contributing](#-contributing)
  - [📄 License](#-license)

## 🌐 Overview

`Repoverse` is designed to keep your code synchronized across multiple repositories. It's perfect for distributed systems and microservices where some part of the code needs to be consistent.

## ⭐ Key Features

- **Automated synchronization**: Propagates commits across all configured repositories, keeping them up-to-date.
- **Flexible usage**: Works as a GitHub Action or directly in your Node.js applications.
- **Precise control**: Synchronize specific paths and branches within repositories.
- **Seamless integration**: Integrates effortlessly into your development workflows.
- **Collaborative synchronization**: Raises pull requests for review and approval, ensuring code quality and alignment.

## 📚 Prerequisites

- Node.js (version 14 or higher)
- npm (or another package manager)
- A GitHub personal access token with access to all the repositories

## ⚙️ Configuration

Repoverse requires a configuration object to specify the repositories to sync and other settings. Here's an example:

```JSON
{
  "repositories": [
    {
      "owner": "example-user",
      "repo": "repo-to-sync-1",
      "path": "models/",
      "branch": "dev"
    },
    {
      "owner": "example-user",
      "repo": "repo-to-sync-2",
      "path": "models/",
      "branch": "dev"
    }
  ],
  "syncBranchPrefix": "sync-branch",
  "accessToken": "ghp_YourGitHubPersonalAccessTokenHere"
}
```

## 📦 Installation

To install `repoverse`, run the following command:

```bash
npm install repoverse
```

## 🚀 Usage

`repoverse` can be used in two different ways:

### As a GitHub Action

Automate synchronization based on GitHub push events:

- Create a workflow file (e.g., `.github/workflows/sync.yml`) in your repository.
- Define the workflow, including triggers, jobs, and steps.
- Use the `repoverse` action within your job to perform synchronization.

Example workflow:

- Make sure that the `REPOVERSE_CONFIG` secret is created in your repository's settings, containing the synchronization configuration in `JSON` format.

```yaml
name: Repository Sync

on:
  push:
    branches:
      - dev
    paths:
      - 'path/to/sync/**'

jobs:
  repoverse:
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
            const {Repoverse} = require('repoverse');
            const config = JSON.parse(process.env.REPOVERSE_CONFIG);
            const repoverse = new Repoverse(config);
            const commits = JSON.parse(process.env.COMMITS); 
            const repository = process.env.REPOSITORY;

            repoverse.synchronize(repository, commits)
              .then(() => console.log('Repositories synchronized successfully'))
              .catch(error => console.error('Synchronization failed:', error));
          "
```

### Programmatically in Your Code

Synchronize code on-demand or with more control:

- Import the Repoverse module in your Node.js application.
- Create a configuration object specifying repositories and settings.
- Instantiate a Repoverse instance with the configuration.
- Use the synchronize method to trigger synchronization.

```javascript
const { Repoverse } = require('repoverse');

// Construct a configuration object for your repositories and settings
const config = {
  // your config here
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

repoverse
  .synchronize(sourceRepo, commits)
  .then(() => console.log('Synchronization successful'))
  .catch(error => console.error('Synchronization failed:', error));
```

## 🔄 Workflow

- Repoverse identifies changes in a source repository(one of the repo in config).
- Creates corresponding branches (prefixed with a configured value) in target(reamining) repositories.
- Applies the changes to those branches and commits them.
- Raises pull requests in the target repositories, inviting review and approval before merging.

## 🤝 Contributing

Contributions to `repoverse` are highly encouraged! If you have a suggestion, fix, or enhancement, please open an issue or a pull request. Help us make repository synchronization seamless for developers.

## 📄 License

Repoverse is licensed under the MIT License.
