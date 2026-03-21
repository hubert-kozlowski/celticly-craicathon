const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    "service-worker": "./src/background/service-worker.ts",
    "content-script": "./src/content/content-script.ts",
    "popup": "./src/popup/popup.ts",
    "options": "./src/options/options.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    // Copy icons so they are available under dist/icons/ as well,
    // in case any bundled asset reference resolves relative to dist.
    new CopyPlugin({
      patterns: [
        { from: "icons", to: path.resolve(__dirname, "dist/icons") },
      ],
    }),
  ],
  // Service workers must not use eval; use cheap-source-map instead
  devtool: "cheap-source-map",
};
