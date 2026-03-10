/* eslint-disable @typescript-eslint/no-var-requires */
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');

module.exports = function (options) {
  return {
    ...options,
    externals: [
      // Keep Prisma client out of the bundle — it contains native binaries
      ({ request }, callback) => {
        if (request && request.startsWith('@prisma/')) {
          return callback(null, 'commonjs ' + request);
        }
        if (request === '.prisma/client') {
          return callback(null, 'commonjs ' + request);
        }
        callback();
      },
    ],
    resolve: {
      ...options.resolve,
      plugins: [
        ...(options.resolve?.plugins ?? []),
        new TsconfigPathsPlugin({
          configFile: 'tsconfig.json',
        }),
      ],
    },
  };
};
