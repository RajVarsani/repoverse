import { RestEndpointMethodTypes } from '@octokit/rest';

export type CommitData =
  RestEndpointMethodTypes['repos']['getCommit']['response'];
export type BlobData = RestEndpointMethodTypes['git']['getBlob']['response'];
