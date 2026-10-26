// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/tests/backend'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*(\\.spec|-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/backend/tsconfig.json',
      },
    ],
  },
  testEnvironment: 'node',
  clearMocks: true,
};
