import salesforce from 'eslint-config-salesforce-typescript';

export default [
  ...salesforce,
  {
    rules: {
      // The template's rule requires Salesforce's copyright header; this project isn't Salesforce's.
      'header/header': 'off',
      // Index signatures after named keys read better in the policy types.
      '@typescript-eslint/member-ordering': 'off',
    },
  },
];
