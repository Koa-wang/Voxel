// Type shims for optional/peer dependencies that do not ship their own types.
// These modules are dynamically imported at runtime and only used when the
// consuming project has the corresponding framework installed.
declare module '@babel/core';
declare module '@babel/preset-typescript';
declare module 'babel-preset-solid';
declare module 'react-dom/server';
declare module 'react-dom/client';
declare module 'postcss';
declare module '@tailwindcss/postcss';
declare module '@unocss/postcss';
