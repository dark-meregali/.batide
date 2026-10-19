// Definições Monarch internas do Monaco, sem tipos publicados.
declare module 'monaco-editor/languages/definitions/typescript/typescript' {
  import type { languages } from 'monaco-editor'
  export const language: languages.IMonarchLanguage
  export const conf: languages.LanguageConfiguration
}
declare module 'monaco-editor/languages/definitions/javascript/javascript' {
  import type { languages } from 'monaco-editor'
  export const language: languages.IMonarchLanguage
  export const conf: languages.LanguageConfiguration
}
