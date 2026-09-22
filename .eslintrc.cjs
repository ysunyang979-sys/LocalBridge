module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['react-hooks', '@typescript-eslint'],
  extends: [],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
