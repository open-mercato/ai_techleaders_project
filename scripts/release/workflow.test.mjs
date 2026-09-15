import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflow = await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('release workflow', () => {
  it('is manual, serialized, and offers every requested version choice', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toMatch(/type: choice[\s\S]*- patch[\s\S]*- minor[\s\S]*- major[\s\S]*- custom/);
    expect(workflow).toContain('custom_version:');
    expect(workflow).toContain('group: devmentor-release');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('enforces the default ref and isolates write credentials from repository code', () => {
    expect(workflow).toContain('if [ "$GITHUB_REF" != "refs/heads/$DEFAULT_BRANCH" ]');
    expect(workflow).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('contents: write');
    expect(workflow.indexOf('GH_TOKEN: ${{ github.token }}')).toBeGreaterThan(workflow.indexOf('npm run test:integration'));
  });

  it('runs the repository gates before creating or publishing a release', () => {
    for (const command of [
      'npm run build',
      'npm run typecheck',
      'npm run typecheck:storybook',
      'npm run typecheck:prototype',
      'npm run build-storybook',
      'npm run lint',
      'npm run test:unit:coverage',
      'npm run test:prototype',
      'npm run test:integration',
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow.indexOf('npm run test:integration')).toBeLessThan(workflow.indexOf('git tag --annotate'));
  });

  it('uses the tested helper and permits only the expected version-file diff', () => {
    expect(workflow).toContain('release.mjs resolve "$VERSION_BUMP" "$CUSTOM_VERSION"');
    expect(workflow).toContain('release.mjs notes "$version" "$notes_file"');
    expect(workflow).toContain('release.mjs verify "$version"');
    expect(workflow).toContain('expected_files=$(node scripts/release/release.mjs files)');
    expect(workflow).toContain('--no-git-tag-version --ignore-scripts');
  });

  it('publishes an annotated tag atomically and creates a verified-notes release', () => {
    expect(workflow).toContain('git push --atomic');
    expect(workflow).toContain('git tag --annotate "$TAG"');
    expect(workflow).toContain('gh release create "$TAG" --verify-tag');
    expect(workflow).toContain('--title "DevMentor $VERSION" --notes-file "$NOTES_FILE"');
  });

  it('keeps a same-commit existing tag as an explicit recovery path', () => {
    expect(workflow).toContain('recovery=true');
    expect(workflow).toContain("if: steps.release.outputs.recovery != 'true'");
    expect(workflow).toContain('test "$remote_commit" = "$(git rev-parse HEAD)"');
    expect(workflow).toContain('GitHub Release $TAG already exists.');
  });
});
