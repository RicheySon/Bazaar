/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    testMatch: ['**/tests/**/*.test.ts', '**/*.test.ts'],
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            useESM: true,
        }],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@bch-wc2|@bitauth|cashscript|@noble|@scure)/)',
    ],
};
