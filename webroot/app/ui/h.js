// Rendering binding: preact + htm (both vendored, no build step).
// Everything UI-side imports from here — swapping the renderer means
// rewriting this one file, not the feature tree.
import { h, render, cloneElement, createElement, Fragment, Component, toChildArray } from 'preact';
import htm from 'htm';

// htm tagged templates bound to preact's h — the only renderer coupling.
export const html = htm.bind(h);
export { h, render, cloneElement, createElement, Fragment, Component, toChildArray };
