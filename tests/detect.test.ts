import { describe, expect, it } from 'vitest';
import { describeFrameworks, detectFrameworks, isMultiFramework } from '../src/adapters/detect.js';

describe('detectFrameworks', () => {
  it('detects vue from dependencies', () => {
    expect(detectFrameworks({ dependencies: { vue: '^3.4.0' } })).toEqual(['vue']);
  });

  it('detects react via react-dom only', () => {
    expect(detectFrameworks({ dependencies: { 'react-dom': '^18.0.0' } })).toEqual(['react']);
  });

  it('detects solid-js', () => {
    expect(detectFrameworks({ dependencies: { 'solid-js': '^1.8.0' } })).toEqual(['solid']);
  });

  it('detects multiple frameworks across deps and devDeps', () => {
    const found = detectFrameworks({
      dependencies: { vue: '^3.4.0' },
      devDependencies: { react: '^18.0.0', 'solid-js': '^1.8.0' },
    });
    expect(found).toEqual(['vue', 'react', 'solid']);
    expect(isMultiFramework(found)).toBe(true);
  });

  it('returns empty array when nothing is installed', () => {
    expect(detectFrameworks({ dependencies: { lodash: '^4.0.0' } })).toEqual([]);
    expect(detectFrameworks({})).toEqual([]);
  });
});

describe('describeFrameworks', () => {
  it('renders human readable output', () => {
    expect(describeFrameworks([])).toBe('none');
    expect(describeFrameworks(['vue'])).toBe('vue');
    expect(describeFrameworks(['vue', 'react'])).toBe('vue + react');
  });
});
