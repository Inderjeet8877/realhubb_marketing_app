// Ambient declaration for plain CSS side-effect imports from third-party
// packages (e.g. `import "react-loading-skeleton/dist/skeleton.css"`).
// Next's webpack build already handles these at runtime; under
// `moduleResolution: "bundler"`, TypeScript's "arbitrary extensions" check
// still wants an explicit module declaration for paths it can resolve to a
// real file on disk (package.json `exports`-resolved paths), unlike local
// relative `./globals.css` imports which the "next" plugin already covers.
declare module "*.css";
